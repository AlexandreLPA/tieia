"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { aiClient } from "@/lib/ai-client";
import type { EngagementScoreResult } from "@/lib/ai-client";
import { useTranscriptStore } from "@/stores/transcript-store";
import { useEditor } from "@/hooks/use-editor";
import { cn } from "@/utils/ui";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAIStore } from "@/stores/ai-store";
import { useAssetsPanelStore } from "@/stores/assets-panel-store";
import { ComplianceCheckTab } from "@/components/editor/compliance-check-tab";
import { TranscribeNotice } from "@/components/editor/transcribe-notice";
import {
	getTranscriptSourceClips,
	mapSegmentsToTimeline,
} from "@/lib/captions/timeline-mapping";

// What counts as the hook: the first seconds of the edited video
const HOOK_SECONDS = 3;

// Light render for analysis only: 10 fps reads faces and motion fine
const MEDIA_ANALYSIS_EXPORT = {
	format: "mp4",
	quality: "low",
	fps: 10,
	includeAudio: true,
	includeWatermark: false,
} as const;

// Why a sub-score can be missing in this check
const NOT_EVALUATED_HINT: Record<string, string> = {
	energy: "precisa analisar o áudio",
	audio_sync: "precisa analisar o áudio",
	face_presence: "precisa analisar o vídeo",
	emotional_arc: "precisa analisar o áudio",
	virality: "o modelo não respondeu; tente de novo",
	curiosity: "sem fala transcrita",
	hook: "sem fala transcrita",
};

function isMeasured(score: EngagementScoreResult, key: string): boolean {
	const sub = score[key as keyof EngagementScoreResult];
	if (typeof sub !== "object" || sub === null || Array.isArray(sub)) return false;
	// Older backends had no flag and always counted everything
	return (sub as { measured?: boolean }).measured !== false;
}

const GRADE_COLORS: Record<string, string> = {
	A: "text-green-400",
	B: "text-blue-400",
	C: "text-yellow-400",
	D: "text-orange-400",
	F: "text-red-400",
};

const GRADE_BG: Record<string, string> = {
	A: "bg-green-500/10 border-green-500/30",
	B: "bg-blue-500/10 border-blue-500/30",
	C: "bg-yellow-500/10 border-yellow-500/30",
	D: "bg-orange-500/10 border-orange-500/30",
	F: "bg-red-500/10 border-red-500/30",
};

const SCORE_LABELS: Record<string, string> = {
	hook: "Gancho",
	curiosity: "Curiosidade",
	energy: "Energia do áudio",
	audio_sync: "Ritmo da música",
	face_presence: "Presença de rosto",
	emotional_arc: "Arco emocional",
	virality: "Potencial viral",
};

const IMPACT_LABELS: Record<string, string> = {
	high: "alto",
	medium: "médio",
	low: "baixo",
};

function buildScorePrompt(score: EngagementScoreResult): string {
	const breakdown = Object.entries(SCORE_LABELS)
		.filter(([key]) => isMeasured(score, key))
		.map(([key, label]) => {
			const sub = score[key as keyof EngagementScoreResult];
			const val =
				typeof sub === "object" && sub !== null && "composite" in sub
					? Math.round((sub as { composite: number }).composite)
					: 0;
			return `- ${label}: ${val}/100`;
		})
		.join("\n");

	const suggestions =
		score.suggestions.length > 0
			? score.suggestions
					.map((s) => `- [impacto ${IMPACT_LABELS[s.expected_impact] ?? s.expected_impact}] ${s.suggestion}`)
					.join("\n")
			: "Nenhuma sugestão gerada.";

	return `Meu vídeo acabou de tirar ${score.grade} (${Math.round(score.composite)}/100) na Pontuação Viral.

Detalhamento:
${breakdown}

Sugestões que o app já gerou:
${suggestions}

Com base nesse detalhamento, explique em linguagem simples por que a nota está baixa e o que está pesando nela. Depois me dê edições concretas e específicas que eu posso fazer no editor para melhorar. Comece pelos sinais mais fracos. Responda em português do Brasil.`;
}

interface ViralityScoreModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ViralityScoreModal({ open, onOpenChange }: ViralityScoreModalProps) {
	const editor = useEditor();
	const segments = useTranscriptStore((s) => s.segments);
	const [score, setScore] = useState<EngagementScoreResult | null>(null);
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [analyzeMedia, setAnalyzeMedia] = useState(true);
	const [progressLabel, setProgressLabel] = useState("Analisando seu vídeo...");
	const [scoredWithMedia, setScoredWithMedia] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [tab, setTab] = useState("score");
	const setPendingAutoPrompt = useAIStore((s) => s.setPendingAutoPrompt);
	const setActiveTab = useAssetsPanelStore((s) => s.setActiveTab);

	const tracks = editor.timeline.getTracks();
	const hasVideo = tracks.some((t) =>
		t.elements.some((el) => el.type === "video" || el.type === "audio" || el.type === "image"),
	);

	const handleCheck = useCallback(async () => {
		setIsAnalyzing(true);
		setError(null);

		try {
			// Score what the edit actually says: the transcript is timed on the
			// source file, so cut parts are dropped and the rest is re-timed
			const timeline = mapSegmentsToTimeline({
				segments,
				clips: getTranscriptSourceClips(editor.timeline.getTracks()),
			});
			const transcriptText = timeline.map((s) => s.text).join(" ");
			const hookText = timeline
				.flatMap((s) => s.words ?? [{ word: s.text, start: s.start, end: s.end }])
				.filter((w) => w.start < HOOK_SECONDS)
				.map((w) => w.word.trim())
				.join(" ");

			const scoreTextOnly = () => {
				setProgressLabel("Analisando o texto falado...");
				return aiClient.engagementScore({
					transcript_text: transcriptText,
					hook_text: hookText,
					start: 0,
					end: editor.timeline.getTotalDuration() || 30,
					title: "Projeto atual",
				});
			};

			let result: EngagementScoreResult;
			setScoredWithMedia(false);
			if (analyzeMedia) {
				// Energy, rhythm, face and the visual hook need the real edit, so
				// render it light: few frames are enough to read faces and motion
				setProgressLabel("Preparando o vídeo da edição...");
				const render = await editor.renderer.exportProject({
					options: MEDIA_ANALYSIS_EXPORT,
					onProgress: ({ progress }) =>
						setProgressLabel(
							`Preparando o vídeo da edição... ${Math.round(progress * 100)}%`,
						),
				});
				if (render.success && render.buffer) {
					setProgressLabel("Analisando áudio, imagem e texto...");
					result = await aiClient.engagementScoreVideo(
						new File([render.buffer], "pontuacao-viral.mp4", { type: "video/mp4" }),
						{ transcriptText, hookText, title: "Projeto atual" },
					);
					setScoredWithMedia(true);
				} else {
					toast.warning("Não deu para preparar o vídeo; avaliando só o texto", {
						description: render.error,
					});
					result = await scoreTextOnly();
				}
			} else {
				result = await scoreTextOnly();
			}
			setScore(result);
			toast.success(`Pontuação Viral: ${result.grade} (${Math.round(result.composite)}/100)`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Falha ao calcular a pontuação";
			setError(msg);
			toast.error("Não foi possível calcular a Pontuação Viral");
		} finally {
			setIsAnalyzing(false);
		}
	}, [segments, editor, analyzeMedia]);

	const handleAskAI = useCallback(() => {
		if (!score) return;
		setPendingAutoPrompt(buildScorePrompt(score));
		setActiveTab("ai");
		onOpenChange(false);
	}, [score, setPendingAutoPrompt, setActiveTab, onOpenChange]);

	// Reset when modal closes
	const handleOpenChange = (v: boolean) => {
		if (!v) {
			setScore(null);
			setError(null);
			setTab("score");
		}
		onOpenChange(v);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Pontuação Viral</DialogTitle>
				</DialogHeader>
				<DialogBody className="space-y-4">
					<Tabs value={tab} onValueChange={setTab}>
						<TabsList>
							<TabsTrigger value="score">Pontuação</TabsTrigger>
							<TabsTrigger value="compliance">Conformidade TikTok</TabsTrigger>
						</TabsList>
						<div className="max-h-[65vh] overflow-y-auto pt-2">
							<TabsContent value="score" className="space-y-4">
								{/* No video state */}
								{!hasVideo && (
									<div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 text-center space-y-2">
										<p className="text-sm font-medium text-yellow-400">Nenhum vídeo na timeline</p>
										<p className="text-xs text-muted-foreground">
											Adicione um vídeo na timeline primeiro e depois confira a pontuação viral antes de publicar.
										</p>
										<Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
											Entendi
										</Button>
									</div>
								)}

								{/* Has video — ready to score */}
								{hasVideo && !score && !isAnalyzing && !error && (
									<div className="text-center space-y-3">
										<p className="text-sm text-muted-foreground">
											Avalie o potencial viral do seu vídeo antes de publicar e receba sugestões práticas para melhorar o engajamento.
										</p>
										<TranscribeNotice description="Esta checagem avalia o que é falado no vídeo, então precisa da transcrição primeiro." />
										<label
											htmlFor="viral-analyze-media"
											className="flex items-start justify-between gap-3 rounded-md border p-3 text-left"
										>
											<span className="flex flex-col gap-0.5">
												<span className="text-xs font-medium">Analisar também áudio e imagem</span>
												<span className="text-[11px] leading-snug text-muted-foreground">
													Mede energia, ritmo, rosto e o impacto visual do começo. Leva mais
													tempo porque prepara uma versão leve do vídeo.
												</span>
											</span>
											<Switch
												id="viral-analyze-media"
												checked={analyzeMedia}
												onCheckedChange={setAnalyzeMedia}
											/>
										</label>
										<Button
											className="w-full"
											onClick={handleCheck}
											disabled={segments.length === 0}
										>
											Calcular Pontuação Viral
										</Button>
									</div>
								)}

								{/* Analyzing */}
								{isAnalyzing && (
									<div className="flex flex-col items-center gap-3 py-6">
										<Spinner className="h-6 w-6" />
										<p className="text-sm text-muted-foreground">{progressLabel}</p>
									</div>
								)}

								{/* Error */}
								{error && (
									<div className="space-y-3">
										<div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
											<p className="text-sm text-red-400">{error}</p>
										</div>
										<Button variant="outline" className="w-full" onClick={handleCheck}>
											Tentar de novo
										</Button>
									</div>
								)}

								{/* Score result */}
								{score && (
									<div className="space-y-4">
										{/* Grade hero */}
										<div className={cn("rounded-xl border p-5 text-center", GRADE_BG[score.grade])}>
											<div className={cn("text-5xl font-bold", GRADE_COLORS[score.grade])}>
												{score.grade}
											</div>
											<div className="text-2xl font-semibold mt-1">
												{Math.round(score.composite)}<span className="text-sm text-muted-foreground">/100</span>
											</div>
											<p className="text-xs text-muted-foreground mt-1">{score.grade_label}</p>
										</div>

										{/* Verdict */}
										<div className="rounded-lg border p-3 text-center">
											{score.composite >= 70 ? (
												<p className="text-sm font-medium text-green-400">Pronto para viralizar!</p>
											) : score.composite >= 50 ? (
												<p className="text-sm font-medium text-yellow-400">Bom potencial, veja as sugestões abaixo</p>
											) : (
												<p className="text-sm font-medium text-red-400">Precisa melhorar antes de publicar</p>
											)}
										</div>

										{/* What the model thought, in its own words */}
										{isMeasured(score, "virality") &&
											typeof score.virality.reason === "string" &&
											score.virality.reason && (
												<div className="space-y-1 rounded-lg border p-3 text-xs">
													<p className="text-muted-foreground">{score.virality.reason}</p>
													{typeof score.virality.suggested_title === "string" &&
														score.virality.suggested_title && (
															<p>
																<span className="text-muted-foreground">Título sugerido: </span>
																{score.virality.suggested_title}
															</p>
														)}
												</div>
											)}

										{/* Sub-scores */}
										<div className="space-y-2">
											<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Detalhamento</h4>
											{Object.entries(SCORE_LABELS).map(([key, label]) => {
												const sub = score[key as keyof EngagementScoreResult];
												const val = typeof sub === "object" && sub !== null && "composite" in sub
													? (sub as { composite: number }).composite
													: 0;

												if (!isMeasured(score, key)) {
													return (
														<div key={key} className="flex items-center gap-2" title={NOT_EVALUATED_HINT[key]}>
															<span className="text-xs text-muted-foreground/60 w-28 flex-shrink-0">{label}</span>
															<span className="flex-1 text-[11px] text-muted-foreground/60">
																não avaliado ·{" "}
																{scoredWithMedia && key !== "virality"
																	? "o serviço de análise não conseguiu medir"
																	: (NOT_EVALUATED_HINT[key] ?? "sem dados")}
															</span>
														</div>
													);
												}

												return (
													<div key={key} className="flex items-center gap-2">
														<span className="text-xs text-muted-foreground w-28 flex-shrink-0">{label}</span>
														<div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
															<div
																className={cn(
																	"h-full rounded-full transition-all",
																	val >= 70 ? "bg-green-500" : val >= 40 ? "bg-yellow-500" : "bg-red-500",
																)}
																style={{ width: `${val}%` }}
															/>
														</div>
														<span className="text-xs text-muted-foreground w-7 text-right">{Math.round(val)}</span>
													</div>
												);
											})}
										</div>

										{score.evaluated && score.evaluated.length < Object.keys(SCORE_LABELS).length && (
											<p className="text-[11px] leading-snug text-muted-foreground">
												A nota usa só o que foi medido ({score.evaluated.length} de{" "}
												{Object.keys(SCORE_LABELS).length} sinais). Os itens não avaliados
												ficam de fora em vez de contar como 50.
											</p>
										)}

										{/* Suggestions */}
										{score.suggestions.length > 0 && (
											<div className="space-y-2">
												<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sugestões</h4>
												{score.suggestions.map((s) => (
													<div key={s.suggestion} className="flex items-start gap-2 text-xs">
														<span className={cn(
															"mt-1 h-2 w-2 rounded-full flex-shrink-0",
															s.expected_impact === "high" ? "bg-red-400" : "bg-yellow-400",
														)} />
														<p className="text-muted-foreground">{s.suggestion}</p>
													</div>
												))}
											</div>
										)}

										{/* Actions */}
										<div className="space-y-2">
											<Button className="w-full" onClick={handleAskAI}>
												Pedir para a IA explicar e corrigir
											</Button>
											<div className="flex gap-2">
												<Button variant="outline" className="flex-1" onClick={handleCheck}>
													Calcular de novo
												</Button>
												<Button variant="outline" className="flex-1" onClick={() => handleOpenChange(false)}>
													Fechar
												</Button>
											</div>
										</div>
									</div>
								)}
							</TabsContent>
							{/* Kept mounted so switching tabs doesn't drop a result */}
							<TabsContent
								value="compliance"
								forceMount
								className="data-[state=inactive]:hidden"
							>
								<ComplianceCheckTab
									hasVideo={hasVideo}
									onClose={() => handleOpenChange(false)}
								/>
							</TabsContent>
						</div>
					</Tabs>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
