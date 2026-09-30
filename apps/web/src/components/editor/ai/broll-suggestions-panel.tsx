"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/utils/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	ViewIcon,
	SparklesIcon,
	Image01Icon,
	Search01Icon,
	Tick01Icon,
	ArrowDown01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { aiClient } from "@/lib/ai-client";
import { useTranscriptStore } from "@/stores/transcript-store";
import { useBackgroundTasksStore } from "@/stores/background-tasks-store";
import { useEditor } from "@/hooks/use-editor";
import { buildImageElement } from "@/lib/timeline/element-utils";
import type { BRollSuggestion, ImageGenResult } from "@/types/ai";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Suggestion cache — keyed by transcript hash to avoid re-analysis
// ---------------------------------------------------------------------------

const _suggestionCache = new Map<string, BRollSuggestion[]>();

function hashSegments(
	segments: { id: number; text: string }[],
): string {
	const raw = segments.map((s) => `${s.id}:${s.text}`).join("|");
	let h = 0;
	for (let i = 0; i < raw.length; i++) {
		h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
	}
	return String(h);
}

// ---------------------------------------------------------------------------
// Priority styling
// ---------------------------------------------------------------------------

const PRIORITY_STYLES: Record<string, string> = {
	high: "border-red-500/30 bg-red-500/5",
	medium: "border-yellow-500/30 bg-yellow-500/5",
	low: "border-muted",
};

const PRIORITY_BADGE: Record<string, string> = {
	high: "text-red-500 border-red-500/30",
	medium: "text-yellow-500 border-yellow-500/30",
	low: "text-muted-foreground border-border",
};

// ---------------------------------------------------------------------------
// Per-suggestion generated image state
// ---------------------------------------------------------------------------

interface CardImageState {
	status: "idle" | "generating" | "done" | "error";
	imageUrl?: string;
	inserted?: boolean;
}

interface VideoGenState {
	status: "idle" | "generating" | "polling" | "done" | "error";
	videoUrl?: string;
	progress?: number;
}

// Minimal video gen state per suggestion card (keyed by suggestion index)
type VideoGenMap = Record<number, VideoGenState>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BRollSuggestionsPanelProps {
	className?: string;
	onSeekTo?: (time: number) => void;
}

export function BRollSuggestionsPanel({
	className,
	onSeekTo,
}: BRollSuggestionsPanelProps) {
	const editor = useEditor();
	const segments = useTranscriptStore((s) => s.segments);
	const bgTasks = useBackgroundTasksStore();
	const [suggestions, setSuggestions] = useState<BRollSuggestion[]>([]);
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

	// Per-card image generation state
	const [imageStates, setImageStates] = useState<Record<number, CardImageState>>({});

	// Batch state
	const [isBatchGenerating, setIsBatchGenerating] = useState(false);
	const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
	const batchCancelRef = useRef(false);

	// Pexels search state
	const [pexelsResults, setPexelsResults] = useState<Record<number, PexelsPhoto[]>>({});
	const [searchingStock, setSearchingStock] = useState<number | null>(null);
	const [videoGenStates, setVideoGenStates] = useState<VideoGenMap>({});

	const hasTranscript = segments.length > 0;
	const highPrioritySuggestions = useMemo(
		() => suggestions.filter((s) => s.priority === "high"),
		[suggestions],
	);

	// ── Analyze transcript (with cache) ──

	const handleAnalyze = useCallback(async () => {
		if (!hasTranscript || isAnalyzing) return;

		const hash = hashSegments(segments);
		const cached = _suggestionCache.get(hash);
		if (cached) {
			setSuggestions(cached);
			setImageStates({});
			setPexelsResults({});
			toast.success(`${cached.length} sugestões em cache carregadas`);
			return;
		}

		setIsAnalyzing(true);
		setError(null);
		setSuggestions([]);
		setImageStates({});
		setPexelsResults({});

		const taskId = `broll-${Date.now()}`;
		bgTasks.addTask({
			id: taskId,
			type: "broll-suggestions",
			label: "Sugestões de B-Roll",
			progress: "Analisando transcrição...",
		});

		try {
			const result = await aiClient.suggestBRoll(
				segments.map((s) => ({
					id: s.id,
					text: s.text,
					start: s.start,
					end: s.end,
					words: s.words.map((w) => ({
						word: w.word,
						start: w.start,
						end: w.end,
						confidence: w.confidence,
					})),
				})),
			);

			setSuggestions(result.suggestions);
			_suggestionCache.set(hash, result.suggestions);

			bgTasks.updateTask(taskId, {
				status: "completed",
				progress: `${result.suggestions.length} sugestões`,
				completedAt: Date.now(),
			});
			if (result.suggestions.length === 0) {
				toast.info("Nenhuma sugestão de B-roll — o conteúdo já funciona bem como está.");
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Falha na análise";
			setError(msg);
			bgTasks.updateTask(taskId, {
				status: "error",
				error: msg,
				completedAt: Date.now(),
			});
		} finally {
			setIsAnalyzing(false);
		}
	}, [hasTranscript, isAnalyzing, segments, bgTasks]);

	// ── Generate image for a single suggestion ──

	const handleGenerateImage = useCallback(
		async (idx: number, prompt: string) => {
			setImageStates((prev) => ({
				...prev,
				[idx]: { status: "generating" },
			}));

			try {
				const result = await aiClient.generateImage({
					prompt,
					width: 1024,
					height: 576,
					steps: 20,
					guidanceScale: 7.5,
				});

				setImageStates((prev) => ({
					...prev,
					[idx]: { status: "done", imageUrl: result.imageUrl },
				}));
				return result;
			} catch {
				setImageStates((prev) => ({
					...prev,
					[idx]: { status: "error" },
				}));
				toast.error("Falha ao gerar a imagem");
				return null;
			}
		},
		[],
	);

	// ── Auto-insert image as overlay at the suggestion's timestamp ──

	const handleInsertToTimeline = useCallback(
		(idx: number, suggestion: BRollSuggestion, imageUrl: string) => {
			const duration = suggestion.endTime - suggestion.startTime;
			const element = buildImageElement({
				mediaId: `broll-${suggestion.segmentIndex}-${Date.now()}`,
				name: `B-Roll: ${suggestion.visualDescription.slice(0, 30)}`,
				duration: Math.max(duration, 2),
				startTime: suggestion.startTime,
			});

			editor.timeline.insertElement({
				element,
				placement: { mode: "auto" },
			});

			setImageStates((prev) => ({
				...prev,
				[idx]: { ...prev[idx], inserted: true },
			}));

			toast.success(`Inserido em ${suggestion.startTime.toFixed(1)}s`);
		},
		[editor],
	);

	// ── Generate + insert in one step ──

	const handleGenerateAndInsert = useCallback(
		async (idx: number, suggestion: BRollSuggestion) => {
			const result = await handleGenerateImage(idx, suggestion.imagePrompt);
			if (result?.imageUrl) {
				handleInsertToTimeline(idx, suggestion, result.imageUrl);
			}
		},
		[handleGenerateImage, handleInsertToTimeline],
	);

	// ── Batch generate all high-priority suggestions ──

	const handleBatchGenerate = useCallback(async () => {
		const targets = suggestions
			.map((s, i) => ({ suggestion: s, idx: i }))
			.filter(
				({ suggestion, idx }) =>
					suggestion.priority === "high" &&
					imageStates[idx]?.status !== "done",
			);

		if (targets.length === 0) {
			toast.info("Todas as imagens de alta prioridade já foram geradas");
			return;
		}

		setIsBatchGenerating(true);
		batchCancelRef.current = false;
		setBatchProgress({ done: 0, total: targets.length });

		const taskId = `broll-batch-${Date.now()}`;
		bgTasks.addTask({
			id: taskId,
			type: "broll-batch",
			label: `Gerando ${targets.length} imagens de B-roll`,
			progress: `0 / ${targets.length}`,
		});

		let completed = 0;
		for (const { suggestion, idx } of targets) {
			if (batchCancelRef.current) break;

			await handleGenerateAndInsert(idx, suggestion);
			completed++;
			setBatchProgress({ done: completed, total: targets.length });
			bgTasks.updateTask(taskId, {
				progress: `${completed} / ${targets.length}`,
			});
		}

		setIsBatchGenerating(false);
		bgTasks.updateTask(taskId, {
			status: batchCancelRef.current ? "error" : "completed",
			progress: batchCancelRef.current
				? `Cancelado em ${completed}/${targets.length}`
				: `${completed} imagens geradas e inseridas`,
			completedAt: Date.now(),
		});

		if (!batchCancelRef.current) {
			toast.success(`${completed} imagens de B-roll geradas e adicionadas à linha do tempo`);
		}
	}, [suggestions, imageStates, bgTasks, handleGenerateAndInsert]);

	// ── Apply all high-priority (generate + insert) ──

	const handleApplyAll = handleBatchGenerate;

	// ── Generate video B-roll via Seedance ──

	const handleGenerateVideo = useCallback(
		async (idx: number, suggestion: BRollSuggestion) => {
			setVideoGenStates((prev) => ({
				...prev,
				[idx]: { status: "generating" },
			}));

			try {
				const project = editor.project.getActiveOrNull();
				const canvasSize = project?.settings.canvasSize ?? {
					width: 1920,
					height: 1080,
				};
				const duration = Math.max(
					suggestion.endTime - suggestion.startTime,
					2,
				);

				const result = await aiClient.generateVideo({
					prompt: suggestion.imagePrompt,
					duration,
					width: canvasSize.width,
					height: canvasSize.height,
					provider: "seedance",
				});

				if (result.status === "processing" && result.jobId) {
					setVideoGenStates((prev) => ({
						...prev,
						[idx]: { status: "polling", progress: 0 },
					}));

					let pollResult = result;
					for (let i = 0; i < 60; i++) {
						await new Promise((r) => setTimeout(r, 5000));
						pollResult = await aiClient.getVideoJob(result.jobId!);
						setVideoGenStates((prev) => ({
							...prev,
							[idx]: {
								status: "polling",
								progress: Math.min((i + 1) / 12, 0.95),
							},
						}));
						if (pollResult.status !== "processing") break;
					}

					if (pollResult.status === "completed" && pollResult.videoUrl) {
						setVideoGenStates((prev) => ({
							...prev,
							[idx]: {
								status: "done",
								videoUrl: pollResult.videoUrl,
							},
						}));
						toast.success("Vídeo de B-roll gerado");
					} else {
						throw new Error(
							pollResult.error ?? "Tempo esgotado ao gerar o vídeo",
						);
					}
				} else if (result.status === "completed" && result.videoUrl) {
					setVideoGenStates((prev) => ({
						...prev,
						[idx]: { status: "done", videoUrl: result.videoUrl },
					}));
					toast.success("Vídeo de B-roll gerado");
				} else {
					throw new Error(result.error ?? "Falha ao gerar o vídeo");
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : "Falha ao gerar o vídeo";
				setVideoGenStates((prev) => ({
					...prev,
					[idx]: { status: "error" },
				}));
				toast.error("Falha no B-roll em vídeo", { description: msg });
			}
		},
		[editor],
	);

	// ── Pexels stock image search ──

	const handleSearchPexels = useCallback(
		async (idx: number, keywords: string[]) => {
			setSearchingStock(idx);
			try {
				const query = keywords.slice(0, 3).join(" ");
				const res = await fetch(
					`/api/images/search?q=${encodeURIComponent(query)}&per_page=6`,
				);
				if (res.ok) {
					const data = await res.json();
					setPexelsResults((prev) => ({
						...prev,
						[idx]: data.photos ?? [],
					}));
				} else {
					toast.error("Falha na busca de imagens de banco. Verifique a chave de API em Configurações.");
				}
			} catch {
				toast.error("Busca de imagens de banco não disponível");
			} finally {
				setSearchingStock(null);
			}
		},
		[],
	);

	// ── Insert a stock photo to timeline ──

	const handleInsertStockPhoto = useCallback(
		(suggestion: BRollSuggestion, photo: PexelsPhoto) => {
			const duration = suggestion.endTime - suggestion.startTime;
			const element = buildImageElement({
				mediaId: `pexels-${photo.id}-${Date.now()}`,
				name: `Banco: ${photo.alt || photo.photographer}`,
				duration: Math.max(duration, 2),
				startTime: suggestion.startTime,
			});

			editor.timeline.insertElement({
				element,
				placement: { mode: "auto" },
			});

			toast.success(`Imagem de banco inserida em ${suggestion.startTime.toFixed(1)}s`);
		},
		[editor],
	);

	return (
		<div className={cn("flex flex-col h-full", className)}>
			{/* Header */}
			<div className="px-4 py-3 border-b space-y-2">
				<div className="flex items-center gap-2">
					<HugeiconsIcon icon={ViewIcon} className="size-4 text-primary" />
					<span className="text-xs font-medium">Sugestões de B-Roll</span>
					{suggestions.length > 0 && (
						<Badge variant="secondary" className="text-[8px] px-1 py-0">
							{suggestions.length}
						</Badge>
					)}
				</div>

				{!hasTranscript ? (
					<p className="text-[10px] text-muted-foreground">
						Transcreva seu vídeo primeiro para receber sugestões de B-roll.
					</p>
				) : (
					<>
						<Button
							onClick={handleAnalyze}
							disabled={isAnalyzing}
							size="sm"
							className="w-full"
						>
							{isAnalyzing ? (
								<>
									<Spinner className="size-3.5 mr-2" />
									Analisando transcrição...
								</>
							) : suggestions.length > 0 ? (
								"Reanalisar"
							) : (
								<>
									<HugeiconsIcon icon={SparklesIcon} className="size-3.5 mr-2" />
									Sugerir B-Roll
								</>
							)}
						</Button>

						{/* Apply All button */}
						{highPrioritySuggestions.length > 0 && (
							<Button
								onClick={handleApplyAll}
								disabled={isBatchGenerating || isAnalyzing}
								size="sm"
								variant="outline"
								className="w-full"
							>
								{isBatchGenerating ? (
									<>
										<Spinner className="size-3.5 mr-2" />
										Gerando {batchProgress.done}/{batchProgress.total}...
										<button
											type="button"
											className="ml-2 text-[9px] text-destructive hover:underline"
											onClick={(e) => {
												e.stopPropagation();
												batchCancelRef.current = true;
											}}
										>
											Cancelar
										</button>
									</>
								) : (
									<>
										<HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 mr-2" />
										Aplicar todas de alta prioridade ({highPrioritySuggestions.length})
									</>
								)}
							</Button>
						)}
					</>
				)}
			</div>

			{/* Results */}
			<ScrollArea className="flex-1 min-h-0">
				<div className="px-4 py-3 space-y-2">
					{error && (
						<div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
							{error}
						</div>
					)}

					{!isAnalyzing && suggestions.length === 0 && !error && hasTranscript && (
						<div className="text-center py-8">
							<HugeiconsIcon
								icon={Image01Icon}
								className="size-8 text-muted-foreground/40 mx-auto mb-2"
							/>
							<p className="text-sm text-muted-foreground">
								A IA vai analisar sua transcrição
							</p>
							<p className="text-xs text-muted-foreground/60 mt-1">
								e sugerir imagens, palavras-chave para banco de vídeos
								e prompts de geração de imagem para cada trecho
							</p>
						</div>
					)}

					{isAnalyzing && suggestions.length === 0 && (
						<div className="text-center py-8">
							<Spinner className="size-6 mx-auto mb-2" />
							<p className="text-sm text-muted-foreground">
								Analisando a transcrição em busca de oportunidades visuais...
							</p>
						</div>
					)}

					{suggestions.map((suggestion, idx) => (
						<BRollCard
							key={`${suggestion.segmentIndex}-${idx}`}
							idx={idx}
							suggestion={suggestion}
							isExpanded={expandedIdx === idx}
							onToggle={() =>
								setExpandedIdx(expandedIdx === idx ? null : idx)
							}
							imageState={imageStates[idx] ?? { status: "idle" }}
							onGenerateImage={() =>
								handleGenerateImage(idx, suggestion.imagePrompt)
							}
							onGenerateAndInsert={() =>
								handleGenerateAndInsert(idx, suggestion)
							}
							onInsertToTimeline={(url) =>
								handleInsertToTimeline(idx, suggestion, url)
							}
							onSearchPexels={() =>
								handleSearchPexels(idx, suggestion.stockKeywords)
							}
							isSearchingStock={searchingStock === idx}
							pexelsPhotos={pexelsResults[idx]}
							onInsertStockPhoto={(photo) =>
								handleInsertStockPhoto(suggestion, photo)
							}
							onSeekTo={onSeekTo}
							videoGenState={videoGenStates[idx] ?? { status: "idle" }}
							onGenerateVideo={() =>
								handleGenerateVideo(idx, suggestion)
							}
						/>
					))}
				</div>
			</ScrollArea>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Pexels types (lightweight inline, no external dep)
// ---------------------------------------------------------------------------

interface PexelsPhoto {
	id: number;
	alt: string;
	photographer: string;
	src: { small: string; medium: string; large: string };
}

// ---------------------------------------------------------------------------
// Suggestion card
// ---------------------------------------------------------------------------

interface BRollCardProps {
	idx: number;
	suggestion: BRollSuggestion;
	isExpanded: boolean;
	onToggle: () => void;
	imageState: CardImageState;
	onGenerateImage: () => void;
	onGenerateAndInsert: () => void;
	onInsertToTimeline: (imageUrl: string) => void;
	onSearchPexels: () => void;
	isSearchingStock: boolean;
	pexelsPhotos?: PexelsPhoto[];
	onInsertStockPhoto: (photo: PexelsPhoto) => void;
	onSeekTo?: (time: number) => void;
	videoGenState?: VideoGenState;
	onGenerateVideo?: () => void;
}

function BRollCard({
	suggestion,
	isExpanded,
	onToggle,
	imageState,
	onGenerateImage,
	onGenerateAndInsert,
	onInsertToTimeline,
	onSearchPexels,
	isSearchingStock,
	pexelsPhotos,
	onInsertStockPhoto,
	onSeekTo,
	videoGenState,
	onGenerateVideo,
}: BRollCardProps) {
	const handleSeek = useCallback(() => {
		if (onSeekTo) {
			onSeekTo(suggestion.startTime);
		}
	}, [onSeekTo, suggestion.startTime]);

	return (
		<div
			className={cn(
				"rounded-lg border overflow-hidden cursor-pointer transition-colors",
				PRIORITY_STYLES[suggestion.priority] ?? PRIORITY_STYLES.medium,
			)}
			onClick={onToggle}
		>
			{/* Collapsed header */}
			<div className="px-3 py-2 flex items-center gap-2">
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						handleSeek();
					}}
					className="flex items-center justify-center size-5 rounded-full bg-primary/10 text-primary shrink-0 hover:bg-primary/20"
					title="Ir para o trecho"
				>
					<span className="text-[9px] font-mono font-bold">
						{suggestion.startTime.toFixed(0)}s
					</span>
				</button>
				<div className="flex-1 min-w-0">
					<p className="text-xs truncate">{suggestion.visualDescription}</p>
				</div>
				{/* Thumbnail preview if generated */}
				{imageState.status === "done" && imageState.imageUrl && (
					<img
						src={imageState.imageUrl}
						alt=""
						className="size-6 rounded object-cover shrink-0 border"
					/>
				)}
				{imageState.status === "generating" && (
					<Spinner className="size-3.5 shrink-0" />
				)}
				{imageState.inserted && (
					<HugeiconsIcon
						icon={Tick01Icon}
						className="size-3.5 text-green-500 shrink-0"
					/>
				)}
				{videoGenState?.status === "generating" ||
					(videoGenState?.status === "polling" && (
						<Spinner className="size-3.5 shrink-0" />
					))}
				{videoGenState?.status === "done" && videoGenState.videoUrl && (
					<div className="size-6 rounded overflow-hidden shrink-0 border bg-black flex items-center justify-center">
						<HugeiconsIcon icon={ViewIcon} className="size-3 text-primary" />
					</div>
				)}
				<Badge
					variant="outline"
					className={cn("text-[8px] px-1 py-0 shrink-0", PRIORITY_BADGE[suggestion.priority])}
				>
					{suggestion.priority}
				</Badge>
			</div>

			{/* Expanded details */}
			{isExpanded && (
				<div className="px-3 pb-3 space-y-2.5 border-t pt-2">
					{/* Generated image preview */}
					{imageState.status === "done" && imageState.imageUrl && (
						<div className="rounded-lg overflow-hidden border bg-black">
							<img
								src={imageState.imageUrl}
								alt={suggestion.visualDescription}
								className="w-full max-h-32 object-contain"
							/>
							{!imageState.inserted && (
								<div className="p-1.5 bg-background border-t">
									<Button
										size="sm"
										className="w-full h-6 text-[10px]"
										onClick={(e) => {
											e.stopPropagation();
											onInsertToTimeline(imageState.imageUrl!);
										}}
									>
										<HugeiconsIcon icon={ArrowDown01Icon} className="size-3 mr-1" />
										Inserir em {suggestion.startTime.toFixed(1)}s
									</Button>
								</div>
							)}
						</div>
					)}

					{/* Segment text */}
					<div>
						<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
							Transcrição
						</p>
						<p className="text-xs text-muted-foreground italic">
							&ldquo;{suggestion.segmentText}&rdquo;
						</p>
						<p className="text-[10px] text-muted-foreground mt-0.5">
							{suggestion.startTime.toFixed(1)}s &ndash; {suggestion.endTime.toFixed(1)}s
						</p>
					</div>

					{/* Visual description */}
					<div>
						<div className="flex items-center gap-1 mb-0.5">
							<HugeiconsIcon icon={ViewIcon} className="size-3 text-primary" />
							<p className="text-[10px] font-medium text-primary uppercase tracking-wider">
								Direção visual
							</p>
						</div>
						<p className="text-xs">{suggestion.visualDescription}</p>
					</div>

					{/* Image prompt */}
					<div>
						<div className="flex items-center gap-1 mb-0.5">
							<HugeiconsIcon icon={Image01Icon} className="size-3 text-muted-foreground" />
							<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
								Prompt de imagem
							</p>
						</div>
						<p className="text-xs text-muted-foreground font-mono bg-muted/30 rounded px-2 py-1">
							{suggestion.imagePrompt}
						</p>
					</div>

					{/* Stock keywords */}
					<div>
						<div className="flex items-center gap-1 mb-1">
							<HugeiconsIcon icon={Search01Icon} className="size-3 text-muted-foreground" />
							<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
								Banco de vídeos
							</p>
						</div>
						<div className="flex flex-wrap gap-1">
							{suggestion.stockKeywords.map((kw) => (
								<Badge
									key={kw}
									variant="secondary"
									className="text-[9px] px-1.5 py-0"
								>
									{kw}
								</Badge>
							))}
						</div>
					</div>

					{/* Pexels search results */}
					{pexelsPhotos && pexelsPhotos.length > 0 && (
						<div>
							<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
								Resultados do banco
							</p>
							<div className="grid grid-cols-3 gap-1">
								{pexelsPhotos.map((photo) => (
									<button
										key={photo.id}
										type="button"
										className="rounded border overflow-hidden hover:ring-2 hover:ring-primary transition-all"
										onClick={(e) => {
											e.stopPropagation();
											onInsertStockPhoto(photo);
										}}
										title={`${photo.alt || "Foto de banco"} por ${photo.photographer}`}
									>
										<img
											src={photo.src.small}
											alt={photo.alt}
											className="w-full h-12 object-cover"
										/>
									</button>
								))}
							</div>
							<p className="text-[9px] text-muted-foreground mt-1">
								Clique em uma foto para inseri-la em {suggestion.startTime.toFixed(1)}s
							</p>
						</div>
					)}

					{/* Mood */}
					<div className="flex items-center gap-1.5">
						<p className="text-[10px] text-muted-foreground">Clima:</p>
						<Badge variant="outline" className="text-[9px] px-1.5 py-0">
							{suggestion.mood}
						</Badge>
					</div>

					{/* Actions */}
					<div className="flex flex-col gap-1.5 pt-1">
						<div className="flex gap-1.5">
							{imageState.status === "done" && !imageState.inserted ? (
								<Button
									size="sm"
									className="flex-1 h-7 text-[10px]"
									onClick={(e) => {
										e.stopPropagation();
										onInsertToTimeline(imageState.imageUrl!);
									}}
								>
									<HugeiconsIcon icon={ArrowDown01Icon} className="size-3 mr-1" />
									Adicionar à linha do tempo
								</Button>
							) : imageState.inserted ? (
								<Button
									size="sm"
									variant="outline"
									className="flex-1 h-7 text-[10px]"
									disabled
								>
									<HugeiconsIcon icon={Tick01Icon} className="size-3 mr-1" />
									Adicionado
								</Button>
							) : (
								<Button
									size="sm"
									variant="default"
									className="flex-1 h-7 text-[10px]"
									disabled={imageState.status === "generating"}
									onClick={(e) => {
										e.stopPropagation();
										onGenerateAndInsert();
									}}
								>
									{imageState.status === "generating" ? (
										<>
											<Spinner className="size-3 mr-1" />
											Gerando...
										</>
									) : (
										<>
											<HugeiconsIcon icon={SparklesIcon} className="size-3 mr-1" />
											Gerar e inserir
										</>
									)}
								</Button>
							)}
							<Button
								size="sm"
								variant="outline"
								className="flex-1 h-7 text-[10px]"
								disabled={isSearchingStock}
								onClick={(e) => {
									e.stopPropagation();
									onSearchPexels();
								}}
							>
								{isSearchingStock ? (
									<Spinner className="size-3 mr-1" />
								) : (
									<HugeiconsIcon icon={Search01Icon} className="size-3 mr-1" />
								)}
								Buscar no Pexels
							</Button>
						</div>
						{imageState.status !== "done" && (
							<Button
								size="sm"
								variant="ghost"
								className="w-full h-6 text-[9px] text-muted-foreground"
								disabled={imageState.status === "generating"}
								onClick={(e) => {
									e.stopPropagation();
									onGenerateImage();
								}}
							>
								Gerar apenas a prévia (não inserir)
							</Button>
						)}
						{onGenerateVideo && videoGenState && (
							<>
								{videoGenState.status === "done" && videoGenState.videoUrl ? (
									<div className="rounded-lg overflow-hidden border bg-black">
										<video
											src={videoGenState.videoUrl}
											controls
											className="w-full max-h-32 object-contain"
										/>
									</div>
								) : (
									<Button
										size="sm"
										variant="outline"
										className="w-full h-7 text-[10px]"
										disabled={
											videoGenState.status === "generating" ||
											videoGenState.status === "polling"
										}
										onClick={(e) => {
											e.stopPropagation();
											onGenerateVideo();
										}}
									>
										{videoGenState.status === "generating" || videoGenState.status === "polling" ? (
											<>
												<Spinner className="size-3 mr-1" />
												{videoGenState.status === "polling"
													? `Renderizando ${Math.round((videoGenState.progress ?? 0) * 100)}%...`
													: "Iniciando..."}
											</>
										) : videoGenState.status === "error" ? (
											"Tentar novamente o B-Roll em vídeo"
										) : (
											<>
												<HugeiconsIcon icon={SparklesIcon} className="size-3 mr-1" />
												Gerar B-Roll em vídeo
											</>
										)}
									</Button>
								)}
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
