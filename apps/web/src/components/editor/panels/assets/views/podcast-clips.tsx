"use client";

import { useCallback, useState } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-view";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTranscriptStore } from "@/stores/transcript-store";
import { useBackgroundTasksStore } from "@/stores/background-tasks-store";
import { useEditor } from "@/hooks/use-editor";
import { aiClient } from "@/lib/ai-client";
import { toast } from "sonner";
import {
	POPOVER_SUBTITLE_PRESETS,
	buildPopoverSubtitleElements,
	distributeElementsToTracks,
	type PopoverSubtitlePreset,
} from "@/lib/podcast/subtitle-presets";
import { buildQuestionCardElement, QUESTION_CARD_TEMPLATES } from "@/lib/templates/question-card";
import type { ClipCandidate, QuestionCard, FaceFrame } from "@/types/ai";
import { hasMediaId } from "@/lib/timeline";
import type { TimelineElement } from "@/types/timeline";

export function PodcastClipsView() {
	const segments = useTranscriptStore((s) => s.segments);
	const editor = useEditor();
	const bgTasks = useBackgroundTasksStore();

	// Clip finder state
	const [clips, setClips] = useState<ClipCandidate[]>([]);
	const [isFindingClips, setIsFindingClips] = useState(false);
	const [isApplying, setIsApplying] = useState(false);

	// Subtitle style
	const [subtitlePreset, setSubtitlePreset] = useState<PopoverSubtitlePreset>("hormozi");

	// Feature toggles
	const [enableQuestionCards, setEnableQuestionCards] = useState(true);
	const [enableKeywordHighlight, setEnableKeywordHighlight] = useState(true);
	const [cardTemplate, setCardTemplate] = useState("overlay");
	const [cardTransparentBg, setCardTransparentBg] = useState(true);

	// Generated data
	const [questionCards, setQuestionCards] = useState<QuestionCard[]>([]);
	const [keywords, setKeywords] = useState<{ word: string; color: string }[]>([]);

	const hasTranscript = segments.length > 0;
	const [isReframing, setIsReframing] = useState(false);
	const speakerPositions = useTranscriptStore((s) => s.speakerPositions);

	// ── Auto-Reframe 16:9 → 9:16 (background task) ──
	const handleAutoReframe = useCallback(async () => {
		const taskId = `auto-reframe-${Date.now()}`;
		setIsReframing(true);

		bgTasks.addTask({
			id: taskId,
			type: "popover-subs",
			label: "Reenquadramento automático 9:16",
			progress: "Localizando arquivo de mídia...",
		});

		try {
			// Find media file
			const tracks = editor.timeline.getTracks();
			let foundMediaId: string | null = null;
			for (const track of tracks) {
				for (const element of track.elements) {
					if (
						(track.type === "video" || track.type === "audio") &&
						hasMediaId(element as TimelineElement)
					) {
						foundMediaId = (element as TimelineElement & { mediaId: string }).mediaId;
						break;
					}
				}
				if (foundMediaId) break;
			}

			if (!foundMediaId) {
				bgTasks.updateTask(taskId, { status: "error", error: "Nenhum vídeo encontrado na linha do tempo.", completedAt: Date.now() });
				return;
			}

			const mediaAsset = editor.media.getAssets().find((a) => a.id === foundMediaId);
			if (!mediaAsset?.file) {
				bgTasks.updateTask(taskId, { status: "error", error: "Não foi possível acessar o arquivo de mídia.", completedAt: Date.now() });
				return;
			}

			bgTasks.updateTask(taskId, { progress: "Detectando rostos..." });

			let file = mediaAsset.file;
			if (!file.name?.includes(".")) {
				file = new File([file], `media.mp4`, { type: file.type || "video/mp4" });
			}

			const faceResult = await aiClient.detectFaces(file, { sampleInterval: 0.5 });

			if (faceResult.total_faces_detected === 0) {
				bgTasks.updateTask(taskId, { status: "completed", progress: "Nenhum rosto detectado", completedAt: Date.now() });
				return;
			}

			bgTasks.updateTask(taskId, { progress: "Aplicando ajustes de corte..." });

			// Change canvas to 9:16
			const canvasSize = editor.project.getActive().settings.canvasSize;
			const isAlreadyVertical = canvasSize.height > canvasSize.width;

			// Compute per-segment face positions based on speaker diarization
			const storeSegs = useTranscriptStore.getState().segments;
			const videoTracks = editor.timeline.getTracks().filter((t) => t.type === "video");

			for (const track of videoTracks) {
				for (const el of track.elements) {
					const videoEl = el as TimelineElement & { transform?: { scale: number; position: { x: number; y: number }; rotate: number } };
					if (!videoEl.transform) continue;

					// Find the dominant face position for this element's time range
					const elStart = el.startTime;
					const elEnd = el.startTime + el.duration;

					// Find which speaker is active during this element
					const activeSeg = storeSegs.find((seg) => seg.start < elEnd && seg.end > elStart);
					const speakerId = activeSeg?.speaker;
					const position = speakerId ? (speakerPositions[speakerId] ?? "center") : "center";

					// Find face frames within this element's time range
					const relevantFrames = faceResult.frames.filter(
						(f) => f.timestamp >= elStart && f.timestamp <= elEnd && f.faces.length > 0,
					);

					let targetX = 0.5; // center
					let targetY = 0.4; // slightly above center

					if (relevantFrames.length > 0) {
						// Average face center across relevant frames
						let sumX = 0;
						let sumY = 0;
						let count = 0;
						for (const frame of relevantFrames) {
							// Pick the face closest to the expected position
							const face = position === "left"
								? frame.faces.reduce((a, b) => (a.x < b.x ? a : b))
								: position === "right"
									? frame.faces.reduce((a, b) => (a.x + a.width > b.x + b.width ? a : b))
									: frame.faces[0];
							sumX += face.x + face.width / 2;
							sumY += face.y + face.height / 2;
							count++;
						}
						targetX = sumX / count;
						targetY = sumY / count;
					}

					if (!isAlreadyVertical) {
						// Apply crop: scale up to fill 9:16 and offset to center on face
						const scaleNeeded = canvasSize.width / (canvasSize.height * (9 / 16));
						const offsetX = (targetX - 0.5) * canvasSize.width * -scaleNeeded;
						const offsetY = (targetY - 0.5) * canvasSize.height * -0.5;

						editor.timeline.updateElements({
							updates: [{
								trackId: track.id,
								elementId: el.id,
								updates: {
									transform: {
										scale: Math.max(scaleNeeded, 1.5),
										position: { x: offsetX, y: offsetY },
										rotate: 0,
									},
								},
							}],
						});
					}
				}
			}

			bgTasks.updateTask(taskId, {
				status: "completed",
				progress: `Reenquadrados ${faceResult.total_faces_detected} rostos em ${faceResult.frames.length} quadros`,
				completedAt: Date.now(),
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : "Falha no reenquadramento automático";
			let detail = message;
			if (message.includes("404")) detail = "Endpoint de rosto não encontrado. Reinicie o backend de IA.";
			else if (message.includes("503")) detail = "Serviço de rosto não está em execução. Inicie com: docker compose up -d face-service";
			else if (message.includes("Cannot connect")) detail = "Backend de IA não está acessível.";
			bgTasks.updateTask(taskId, { status: "error", error: detail, completedAt: Date.now() });
		} finally {
			setIsReframing(false);
		}
	}, [editor, bgTasks, speakerPositions]);

	// ── Find Best Clips (background task) ──
	const handleFindClips = useCallback(async () => {
		if (!hasTranscript) return;

		const taskId = `clip-finder-${Date.now()}`;
		setIsFindingClips(true);

		bgTasks.addTask({
			id: taskId,
			type: "clip-finder",
			label: "Encontrar os melhores clipes",
			progress: "Analisando transcrição com IA...",
		});

		try {
			const result = await aiClient.findClips(segments);
			setClips(result.clips);

			if (result.clips.length === 0) {
				bgTasks.updateTask(taskId, {
					status: "completed",
					progress: "Nenhum clipe com boa pontuação encontrado",
					completedAt: Date.now(),
				});
			} else {
				bgTasks.updateTask(taskId, {
					status: "completed",
					progress: `${result.clips.length} clipes encontrados`,
					completedAt: Date.now(),
				});
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Falha ao encontrar clipes";
			const detail = message.includes("Cannot connect") || message.includes("connection_refused")
				? "Não foi possível conectar ao backend de IA. Verifique se está em execução com o Ollama (docker compose up -d)."
				: message.includes("503")
					? "O LLM do Ollama não está disponível. Inicie com: docker compose up -d ollama"
					: message;
			bgTasks.updateTask(taskId, {
				status: "error",
				error: detail,
				completedAt: Date.now(),
			});
		} finally {
			setIsFindingClips(false);
		}
	}, [segments, hasTranscript, bgTasks]);

	// ── Preview Clip (seek to time) ──
	const handlePreviewClip = useCallback(
		(clip: ClipCandidate) => {
			editor.playback.seek({ time: clip.start });
			toast.info(`Indo para ${clip.title}`, {
				description: `${clip.start.toFixed(1)}s - ${clip.end.toFixed(1)}s`,
			});
		},
		[editor],
	);

	// ── Apply Clip (generate subtitle elements — background task) ──
	const handleApplyClip = useCallback(
		async (clip: ClipCandidate) => {
			const taskId = `apply-clip-${Date.now()}`;
			setIsApplying(true);

			bgTasks.addTask({
				id: taskId,
				type: "popover-subs",
				label: `Aplicar: ${clip.title}`,
				progress: "Preparando segmentos do clipe...",
			});

			try {
				// Filter segments to the clip's time range
				const clipSegments = segments
					.filter((seg) => seg.start < clip.end && seg.end > clip.start)
					.map((seg) => ({
						text: seg.text,
						start: Math.max(seg.start, clip.start),
						end: Math.min(seg.end, clip.end),
						words: seg.words
							.filter((w) => w.start >= clip.start && w.end <= clip.end)
							.map((w) => ({
								word: w.word,
								start: w.start,
								end: w.end,
								confidence: w.confidence,
							})),
					}));

				// Extract keywords if enabled
				let clipKeywords: { word: string; color: string }[] = [];
				if (enableKeywordHighlight) {
					try {
						bgTasks.updateTask(taskId, { progress: "Extraindo palavras-chave..." });
						const kwResult = await aiClient.extractKeywords(
							clipSegments.map((s, i) => ({
								id: i,
								text: s.text,
								start: s.start,
								end: s.end,
								words: s.words,
							})),
						);
						clipKeywords = kwResult.keywords;
						setKeywords(clipKeywords);
					} catch {
						// Continue without keywords
					}
				}

				// Generate question cards if enabled
				let cards: QuestionCard[] = [];
				if (enableQuestionCards) {
					try {
						bgTasks.updateTask(taskId, { progress: "Gerando cartões de tópicos..." });
						const cardsResult = await aiClient.generateQuestionCards(
							clipSegments.map((s, i) => ({
								id: i,
								text: s.text,
								start: s.start,
								end: s.end,
								words: s.words,
							})),
							2,
						);
						cards = cardsResult.cards;
						setQuestionCards(cards);
					} catch {
						// Continue without cards
					}
				}

				bgTasks.updateTask(taskId, { progress: "Adicionando à linha do tempo..." });
				const canvasSize = editor.project.getActive().settings.canvasSize;

				// Build card time ranges so subtitles can skip them
				const cardRanges = cards.map((c) => ({ start: c.timestamp, end: c.timestamp + 2.5 }));

				// Build popover elements (skipping card time ranges)
				const subtitleElements = buildPopoverSubtitleElements({
					segments: clipSegments,
					preset: subtitlePreset,
					canvasHeight: canvasSize.height,
					canvasWidth: canvasSize.width,
					keywords: clipKeywords,
					cardTimeRanges: cardRanges,
				});

				// Distribute across multiple tracks so overlapping words are all visible
				const trackBuckets = distributeElementsToTracks(subtitleElements);

				for (let t = 0; t < trackBuckets.length; t++) {
					const subTrackId = editor.timeline.addTrack({ type: "text", index: 0 });
					const label = trackBuckets.length === 1
						? "Legendas Popover"
						: `Legendas Popover ${t + 1}`;
					editor.timeline.renameTrack({ trackId: subTrackId, name: label });

					for (const el of trackBuckets[t]) {
						editor.timeline.insertElement({
							placement: { mode: "explicit", trackId: subTrackId },
							element: el,
						});
					}
				}

				// Add question card track if cards were generated
				if (cards.length > 0) {
					const cardTrackId = editor.timeline.addTrack({ type: "text", index: 0 });
					editor.timeline.renameTrack({ trackId: cardTrackId, name: "Cartões de Tópicos" });

					for (const card of cards) {
						const cardElement = buildQuestionCardElement({
							question: card.question,
							startTime: card.timestamp,
							theme: cardTemplate,
							emoji: card.emoji,
							useTransparentBackground: cardTransparentBg,
						});
						editor.timeline.insertElement({
							placement: { mode: "explicit", trackId: cardTrackId },
							element: cardElement,
						});
					}
				}

				const summary = `${subtitleElements.length} palavras em ${trackBuckets.length} faixas${cards.length > 0 ? `, ${cards.length} cartões` : ""}`;
				bgTasks.updateTask(taskId, {
					status: "completed",
					progress: summary,
					completedAt: Date.now(),
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : "Falha ao aplicar clipe";
				bgTasks.updateTask(taskId, {
					status: "error",
					error: message,
					completedAt: Date.now(),
				});
			} finally {
				setIsApplying(false);
			}
		},
		[segments, editor, subtitlePreset, enableKeywordHighlight, enableQuestionCards, cardTemplate, cardTransparentBg, bgTasks],
	);

	// ── Add Popover Subtitles (full transcript — background task) ──
	const handleAddPopoverSubs = useCallback(async () => {
		if (!hasTranscript) return;

		const taskId = `popover-subs-${Date.now()}`;
		setIsApplying(true);

		bgTasks.addTask({
			id: taskId,
			type: "popover-subs",
			label: "Legendas Popover",
			progress: "Iniciando...",
		});

		try {
			let kws: { word: string; color: string }[] = [];
			if (enableKeywordHighlight) {
				try {
					bgTasks.updateTask(taskId, { progress: "Extraindo palavras-chave..." });
					const kwResult = await aiClient.extractKeywords(segments);
					kws = kwResult.keywords;
					setKeywords(kws);
				} catch {
					// Continue without keywords
				}
			}

			bgTasks.updateTask(taskId, { progress: "Construindo elementos Popover..." });
			const canvasSize = editor.project.getActive().settings.canvasSize;

			const subtitleElements = buildPopoverSubtitleElements({
				segments: segments.map((s) => ({
					text: s.text,
					start: s.start,
					end: s.end,
					words: s.words,
				})),
				preset: subtitlePreset,
				canvasHeight: canvasSize.height,
				canvasWidth: canvasSize.width,
				keywords: kws,
			});

			// Distribute across multiple tracks so overlapping words are all visible
			const trackBuckets = distributeElementsToTracks(subtitleElements);

			for (let t = 0; t < trackBuckets.length; t++) {
				const trackId = editor.timeline.addTrack({ type: "text", index: 0 });
				const label = trackBuckets.length === 1
					? "Legendas Popover"
					: `Legendas Popover ${t + 1}`;
				editor.timeline.renameTrack({ trackId, name: label });

				for (const el of trackBuckets[t]) {
					editor.timeline.insertElement({
						placement: { mode: "explicit", trackId },
						element: el,
					});
				}
			}

			bgTasks.updateTask(taskId, {
				status: "completed",
				progress: `${subtitleElements.length} palavras em ${trackBuckets.length} faixas`,
				completedAt: Date.now(),
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : "Falha ao adicionar legendas Popover";
			bgTasks.updateTask(taskId, {
				status: "error",
				error: message,
				completedAt: Date.now(),
			});
		} finally {
			setIsApplying(false);
		}
	}, [segments, editor, subtitlePreset, enableKeywordHighlight, hasTranscript, bgTasks]);

	// ── Generate Question Cards (full transcript — background task) ──
	const handleGenerateCards = useCallback(async () => {
		if (!hasTranscript) return;

		const taskId = `question-cards-${Date.now()}`;
		setIsApplying(true);

		bgTasks.addTask({
			id: taskId,
			type: "question-cards",
			label: "Cartões de perguntas",
			progress: "Analisando mudanças de tópico...",
		});

		try {
			const result = await aiClient.generateQuestionCards(segments, 5);
			setQuestionCards(result.cards);

			if (result.cards.length === 0) {
				bgTasks.updateTask(taskId, {
					status: "completed",
					progress: "Nenhuma mudança de tópico detectada",
					completedAt: Date.now(),
				});
				return;
			}

			bgTasks.updateTask(taskId, { progress: "Adicionando cartões à linha do tempo..." });

			const cardTrackId = editor.timeline.addTrack({ type: "text", index: 0 });
			editor.timeline.renameTrack({ trackId: cardTrackId, name: "Cartões de Tópicos" });

			for (const card of result.cards) {
				const cardElement = buildQuestionCardElement({
					question: card.question,
					startTime: card.timestamp,
					theme: cardTemplate,
					emoji: card.emoji,
					useTransparentBackground: cardTransparentBg,
				});
				editor.timeline.insertElement({
					placement: { mode: "explicit", trackId: cardTrackId },
					element: cardElement,
				});
			}

			bgTasks.updateTask(taskId, {
				status: "completed",
				progress: `${result.cards.length} cartões adicionados`,
				completedAt: Date.now(),
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : "Falha ao gerar cartões de perguntas";
			const detail = message.includes("Cannot connect") || message.includes("connection_refused")
				? "Não foi possível conectar ao backend de IA. Verifique se o Ollama está em execução."
				: message.includes("503")
					? "O LLM do Ollama não está disponível. Inicie com: docker compose up -d ollama"
					: message;
			bgTasks.updateTask(taskId, {
				status: "error",
				error: detail,
				completedAt: Date.now(),
			});
		} finally {
			setIsApplying(false);
		}
	}, [segments, editor, hasTranscript, cardTemplate, cardTransparentBg, bgTasks]);

	const isProcessing = isFindingClips || isApplying;

	return (
		<PanelView title="Clipes de Podcast">
			<div className="flex flex-col gap-4 pb-4">
				{!hasTranscript ? (
					<div className="flex flex-col gap-3">
						<p className="text-xs text-muted-foreground leading-relaxed">
							Transcreva seu vídeo primeiro usando a aba Transcrição e depois volte aqui para criar clipes no estilo podcast.
						</p>
					</div>
				) : (
					<>
						{/* ── Smart Clip Finder ── */}
						<div className="flex flex-col gap-2">
							<Label className="text-xs font-medium">Encontrar os melhores clipes</Label>
							<p className="text-[11px] text-muted-foreground leading-relaxed">
								A IA analisa sua transcrição e encontra os momentos com maior potencial viral. Você pode trocar de aba enquanto ela roda.
							</p>
							<Button
								variant="default"
								size="sm"
								className="w-full"
								onClick={handleFindClips}
								disabled={isFindingClips}
							>
								{isFindingClips && <Spinner className="mr-1 size-3" />}
								{isFindingClips
									? "Buscando clipes..."
									: clips.length > 0
										? "Buscar novamente"
										: "Encontrar os melhores clipes"}
							</Button>
						</div>

						{/* ── Clip Candidates ── */}
						{clips.length > 0 && (
							<div className="flex flex-col gap-2">
								<div className="flex items-center justify-between">
									<Label className="text-xs font-medium">Clipes candidatos</Label>
									<span className="text-[10px] text-muted-foreground tabular-nums">
										{clips.length} encontrados
									</span>
								</div>
								<div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
									{clips.map((clip, idx) => (
										<div
											key={`${clip.start}-${clip.end}`}
											className="rounded-md border p-2.5 flex flex-col gap-1.5"
										>
											<div className="flex items-start justify-between gap-2">
												<div className="flex-1 min-w-0">
													<p className="text-xs font-medium truncate">
														{idx + 1}. {clip.title}
													</p>
													<p className="text-[10px] text-muted-foreground tabular-nums">
														{formatTime(clip.start)} - {formatTime(clip.end)}
													</p>
												</div>
												<Badge
													variant={clip.score >= 80 ? "default" : "secondary"}
													className="text-[9px] px-1.5 py-0 h-4 shrink-0"
												>
													{clip.score}/100
												</Badge>
											</div>
											{clip.reason && (
												<p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
													{clip.reason}
												</p>
											)}
											{clip.tags.length > 0 && (
												<div className="flex flex-wrap gap-1">
													{clip.tags.slice(0, 3).map((tag) => (
														<Badge
															key={tag}
															variant="outline"
															className="text-[8px] px-1 py-0 h-3.5"
														>
															{tag}
														</Badge>
													))}
												</div>
											)}
											<div className="flex gap-1.5 mt-0.5">
												<Button
													variant="outline"
													size="sm"
													className="h-6 text-[10px] flex-1"
													onClick={() => handlePreviewClip(clip)}
													disabled={isProcessing}
												>
													Prévia
												</Button>
												<Button
													variant="default"
													size="sm"
													className="h-6 text-[10px] flex-1"
													onClick={() => handleApplyClip(clip)}
													disabled={isProcessing}
												>
													Aplicar
												</Button>
											</div>
										</div>
									))}
								</div>
							</div>
						)}

						{/* ── Subtitle Style ── */}
						<div className="border-t pt-3 flex flex-col gap-2">
							<Label className="text-xs font-medium">Estilo de legenda Popover</Label>
							<Select
								value={subtitlePreset}
								onValueChange={(v) => setSubtitlePreset(v as PopoverSubtitlePreset)}
							>
								<SelectTrigger className="h-8 text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{POPOVER_SUBTITLE_PRESETS.map((p) => (
										<SelectItem key={p.id} value={p.id}>
											<div className="flex flex-col">
												<span className="text-xs">{p.name}</span>
												<span className="text-[10px] text-muted-foreground">
													{p.description}
												</span>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button
								variant="outline"
								size="sm"
								className="w-full"
								onClick={handleAddPopoverSubs}
								disabled={isProcessing}
							>
								{isApplying && <Spinner className="mr-1 size-3" />}
								Adicionar legendas Popover
							</Button>
						</div>

						{/* ── Auto Features ── */}
						<div className="border-t pt-3 flex flex-col gap-3">
							<Label className="text-xs font-medium">Recursos automáticos</Label>

							<div className="flex items-center justify-between">
								<div className="flex flex-col">
									<span className="text-xs">Destaque de palavras-chave</span>
									<span className="text-[10px] text-muted-foreground">
										Destaca palavras importantes por cor usando IA
									</span>
								</div>
								<Switch
									checked={enableKeywordHighlight}
									onCheckedChange={setEnableKeywordHighlight}
								/>
							</div>

							<div className="flex items-center justify-between">
								<div className="flex flex-col">
									<span className="text-xs">Cartões de perguntas</span>
									<span className="text-[10px] text-muted-foreground">
										Slides de introdução de tópicos gerados por IA entre os segmentos
									</span>
								</div>
								<Switch
									checked={enableQuestionCards}
									onCheckedChange={setEnableQuestionCards}
								/>
							</div>
						</div>

						{/* ── Auto-Reframe ── */}
						<div className="border-t pt-3 flex flex-col gap-2">
							<Label className="text-xs font-medium">Reenquadramento automático para Shorts</Label>
							<p className="text-[11px] text-muted-foreground leading-relaxed">
								Detecta rostos e corta automaticamente o vídeo de 16:9 para 9:16 vertical, centralizando no falante ativo.
							</p>
							<Button
								variant="outline"
								size="sm"
								className="w-full"
								onClick={handleAutoReframe}
								disabled={isProcessing || isReframing}
							>
								{isReframing && <Spinner className="mr-1 size-3" />}
								{isReframing ? "Reenquadrando..." : "Reenquadramento automático 9:16"}
							</Button>
						</div>

						{/* ── Question Cards ── */}
						<div className="border-t pt-3 flex flex-col gap-2">
							<Label className="text-xs font-medium">Cartões de tópicos</Label>
							<p className="text-[11px] text-muted-foreground leading-relaxed">
								Perguntas de tópicos geradas por IA sobrepostas ao vídeo. As legendas ficam ocultas durante os cartões.
							</p>

							<Select
								value={cardTemplate}
								onValueChange={setCardTemplate}
							>
								<SelectTrigger className="h-8 text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{QUESTION_CARD_TEMPLATES.map((t) => (
										<SelectItem key={t.id} value={t.id}>
											<div className="flex flex-col">
												<span className="text-xs">{t.name}</span>
												<span className="text-[10px] text-muted-foreground">
													{t.description}
												</span>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							<div className="flex items-center justify-between">
								<div className="flex flex-col">
									<span className="text-xs">Fundo transparente</span>
									<span className="text-[10px] text-muted-foreground">
										Mostra o vídeo atrás do texto do cartão
									</span>
								</div>
								<Switch
									checked={cardTransparentBg}
									onCheckedChange={setCardTransparentBg}
								/>
							</div>

							<Button
								variant="outline"
								size="sm"
								className="w-full"
								onClick={handleGenerateCards}
								disabled={isProcessing}
							>
								{isApplying && <Spinner className="mr-1 size-3" />}
								Gerar cartões de perguntas
							</Button>

							{questionCards.length > 0 && (
								<div className="flex flex-col gap-1 mt-1">
									{questionCards.map((card) => (
										<div
											key={card.timestamp}
											className="flex items-center gap-2 rounded-md border px-2 py-1.5"
										>
											{card.emoji && (
												<span className="text-sm shrink-0">{card.emoji}</span>
											)}
											<div className="flex-1 min-w-0">
												<p className="text-[11px] font-medium truncate">
													{card.question}
												</p>
												<p className="text-[9px] text-muted-foreground tabular-nums">
													{formatTime(card.timestamp)}
												</p>
											</div>
											<Badge
												variant="outline"
												className="text-[8px] px-1 py-0 h-3.5 shrink-0"
											>
												{card.theme}
											</Badge>
										</div>
									))}
								</div>
							)}
						</div>

						{/* ── Keywords (if extracted) ── */}
						{keywords.length > 0 && (
							<div className="border-t pt-3 flex flex-col gap-2">
								<Label className="text-xs font-medium">Palavras-chave detectadas</Label>
								<div className="flex flex-wrap gap-1">
									{keywords.slice(0, 20).map((kw) => (
										<Badge
											key={kw.word}
											variant="outline"
											className="text-[10px] px-1.5 py-0 h-5"
											style={{ borderColor: kw.color, color: kw.color }}
										>
											{kw.word}
										</Badge>
									))}
								</div>
							</div>
						)}
					</>
				)}
			</div>
		</PanelView>
	);
}

function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}
