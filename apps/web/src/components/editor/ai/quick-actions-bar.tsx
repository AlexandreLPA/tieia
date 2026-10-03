"use client";

import { useCallback, useMemo, useState } from "react";
import {
	addCaptionTrack,
	CAPTION_TRACK_PREFIX,
} from "@/lib/captions/add-captions";
import { cn } from "@/utils/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	TextIcon,
	Delete02Icon,
	AiMicIcon,
	Tick01Icon,
	CheckmarkBadge01Icon,
	Mic01Icon,
	ClosedCaptionIcon,
	Scissor01Icon,
} from "@hugeicons/core-free-icons";
import { useTranscriptStore } from "@/stores/transcript-store";
import { useEditor } from "@/hooks/use-editor";
import { useTextTimelineBridge } from "@/hooks/use-text-timeline-bridge";
import { useSmartCut } from "@/hooks/use-smart-cut";
import { computeCutsFromDeletedSegments } from "@/lib/text-timeline-sync";
import { aiClient } from "@/lib/ai-client";
import { useAssetsPanelStore } from "@/stores/assets-panel-store";
import { useBackgroundTasksStore } from "@/stores/background-tasks-store";
import {
	buildPopoverSubtitleElements,
	distributeElementsToTracks,
} from "@/lib/podcast/subtitle-presets";
import { toast } from "sonner";

type ActionStatus = "idle" | "running" | "done";

const FILLER_WORDS = new Set([
	"um",
	"uh",
	"like",
	"you know",
	"so",
	"basically",
	"actually",
	"literally",
	"right",
	"well",
	"er",
	"ah",
	"hmm",
	"huh",
	"okay",
	"ok",
]);

/**
 * Floating bar that appears after transcription with one-click editing
 * operations. Designed for non-editors who want to clean up a video
 * without learning video editing.
 */
export function QuickActionsBar({ className }: { className?: string }) {
	const segments = useTranscriptStore((s) => s.segments);
	const editor = useEditor();
	const { handleDeleteSegments } = useTextTimelineBridge();
	const { runSmartCut } = useSmartCut();

	const [fillerStatus, setFillerStatus] = useState<ActionStatus>("idle");
	const [fillerCount, setFillerCount] = useState(0);
	const [silenceStatus, setSilenceStatus] = useState<ActionStatus>("idle");
	const [silenceCount, setSilenceCount] = useState(0);
	const [factcheckStatus, setFactcheckStatus] = useState<ActionStatus>("idle");
	const [popoverSubStatus, setPopoverSubStatus] =
		useState<ActionStatus>("idle");
	const [popoverSubCount, setPopoverSubCount] = useState(0);
	const [findClipsStatus, setFindClipsStatus] = useState<ActionStatus>("idle");
	const [smartCutStatus, setSmartCutStatus] = useState<ActionStatus>("idle");

	// Derive subtitle state from actual timeline tracks
	const subtitleTrackId = useMemo(() => {
		const tracks = editor.timeline.getTracks();
		const textTrack = tracks.find(
			(t) =>
				t.type === "text" &&
				t.elements.length > 0 &&
				(t.name?.startsWith(CAPTION_TRACK_PREFIX) ||
					t.elements.some(
						(el) =>
							"name" in el &&
							(el.name?.startsWith("Subtitle ") ||
								el.name?.startsWith("Caption ")),
					)),
		);
		return textTrack?.id ?? null;
	}, [editor, segments]); // re-derive when segments change (triggers re-render)

	// Derive filler count from transcript on mount / segment change
	const currentFillerCount = useMemo(() => {
		let count = 0;
		for (const seg of segments) {
			for (const w of seg.words) {
				const clean = w.word
					.toLowerCase()
					.replace(/[.,!?]/g, "")
					.trim();
				if (FILLER_WORDS.has(clean)) count++;
			}
		}
		return count;
	}, [segments]);

	// Derive silence count from transcript
	const currentSilenceCount = useMemo(() => {
		if (segments.length < 2) return 0;
		const sorted = [...segments].sort((a, b) => a.start - b.start);
		let count = 0;
		for (let i = 0; i < sorted.length - 1; i++) {
			const gap = sorted[i + 1].start - sorted[i].end;
			if (gap >= 1.0) count++;
		}
		return count;
	}, [segments]);

	// Derive effect track presence
	const hasEffectTrack = useMemo(() => {
		const tracks = editor.timeline.getTracks();
		return tracks.some((t) => t.type === "effect" && t.elements.length > 0);
	}, [editor, segments]);

	// --- Find & Remove Fillers ---
	const handleFillers = useCallback(() => {
		if (fillerStatus === "done") {
			// Remove segments that are entirely filler words
			const segs = useTranscriptStore.getState().segments;
			const segmentsToRemove: string[] = [];

			for (const seg of segs) {
				const words = seg.text.trim().split(/\s+/);
				const fillerWords = words.filter((w) =>
					FILLER_WORDS.has(
						w
							.toLowerCase()
							.replace(/[.,!?]/g, "")
							.trim(),
					),
				);
				if (words.length > 0 && fillerWords.length / words.length >= 0.8) {
					segmentsToRemove.push(String(seg.id));
				}
			}

			if (segmentsToRemove.length > 0) {
				const toDelete = segs.filter((s) =>
					segmentsToRemove.includes(String(s.id)),
				);
				const cuts = computeCutsFromDeletedSegments(toDelete);
				handleDeleteSegments(segmentsToRemove, cuts);
				toast.success(`${segmentsToRemove.length} trechos de preenchimento removidos`);
			} else {
				toast.info(
					"Nenhum trecho é predominantemente de palavras de preenchimento. Use a edição por palavra no painel de transcrição.",
				);
			}
			setFillerStatus("idle");
		} else {
			setFillerCount(currentFillerCount);
			setFillerStatus("done");
			if (currentFillerCount > 0) {
				toast.success(`${currentFillerCount} palavras de preenchimento encontradas`, {
					description: "Clique novamente para removê-las do vídeo.",
				});
			} else {
				toast.info("Nenhuma palavra de preenchimento encontrada na transcrição.");
			}
		}
	}, [fillerStatus, currentFillerCount, handleDeleteSegments]);

	// --- Find & Remove Silences ---
	const handleSilences = useCallback(() => {
		if (silenceStatus === "done") {
			toast.success(
				"Os silêncios são removidos quando você exclui trechos (os intervalos se fecham automaticamente).",
			);
			setSilenceStatus("idle");
		} else {
			setSilenceCount(currentSilenceCount);
			setSilenceStatus("done");
			if (currentSilenceCount > 0) {
				toast.success(`${currentSilenceCount} intervalos de silêncio encontrados (>1s)`);
			} else {
				toast.info("Nenhum silêncio significativo encontrado entre os trechos.");
			}
		}
	}, [silenceStatus, currentSilenceCount]);

	// --- Add / Remove Subtitles ---
	const handleSubtitles = useCallback(() => {
		if (subtitleTrackId) {
			editor.timeline.removeTrack({ trackId: subtitleTrackId });
			toast.success("Legendas removidas");
			return;
		}

		const currentSegments = useTranscriptStore.getState().segments;
		if (currentSegments.length === 0) return;

		// Same captions as the Legendas panel: chosen style, short chunks,
		// spoken-word highlight, timed to the edit (was a black box per phrase)
		addCaptionTrack({ editor, segments: currentSegments, languageLabel: "Legenda" });

		toast.success("Legendas adicionadas à linha do tempo");
	}, [editor, subtitleTrackId]);

	// --- Fact Check ---
	const handleFactCheck = useCallback(async () => {
		const currentSegments = useTranscriptStore.getState().segments;
		if (currentSegments.length === 0) return;

		setFactcheckStatus("running");
		try {
			const fullText = currentSegments.map((s) => s.text).join(" ");
			const result = await aiClient.factCheck(fullText);

			if (result.claims.length === 0) {
				toast.info("Nenhuma alegação verificável encontrada.");
			} else {
				const trueCount = result.claims.filter(
					(c) => c.verdict === "True",
				).length;
				const falseCount = result.claims.filter(
					(c) => c.verdict === "False",
				).length;
				toast.success(`Verificação de fatos concluída: ${result.claims.length} alegações`, {
					description: `${trueCount} verdadeiras, ${falseCount} falsas. Abra o painel de Verificação de Fatos para mais detalhes.`,
				});
			}
			setFactcheckStatus("done");
		} catch {
			toast.error("Falha na verificação de fatos. Verifique se o backend de IA está em execução.");
			setFactcheckStatus("idle");
		}
	}, []);

	// --- Add Popover Subtitles ---
	const handlePopoverSubs = useCallback(async () => {
		const currentSegments = useTranscriptStore.getState().segments;
		if (currentSegments.length === 0) return;

		const taskId = `popover-subs-quick-${Date.now()}`;
		const bgTasks = useBackgroundTasksStore.getState();

		setPopoverSubStatus("running");
		bgTasks.addTask({
			id: taskId,
			type: "popover-subs",
			label: "Legendas popover",
			progress: "Criando elementos de legenda...",
		});

		try {
			const canvasSize = editor.project.getActive().settings.canvasSize;

			const subtitleElements = buildPopoverSubtitleElements({
				segments: currentSegments.map((s) => ({
					text: s.text,
					start: s.start,
					end: s.end,
					words: s.words,
				})),
				preset: "hormozi",
				canvasHeight: canvasSize.height,
				canvasWidth: canvasSize.width,
			});

			// Distribute across multiple tracks so overlapping words are all visible
			const trackBuckets = distributeElementsToTracks(subtitleElements);

			for (let t = 0; t < trackBuckets.length; t++) {
				const trackId = editor.timeline.addTrack({ type: "text", index: 0 });
				const label =
					trackBuckets.length === 1 ? "Legendas Popover" : `Legendas Popover ${t + 1}`;
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
				progress: `${subtitleElements.length} words across ${trackBuckets.length} tracks`,
				completedAt: Date.now(),
			});
			setPopoverSubCount((c) => c + 1);
			setPopoverSubStatus("idle");
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Falha ao adicionar legendas popover";
			bgTasks.updateTask(taskId, {
				status: "error",
				error: message,
				completedAt: Date.now(),
			});
			setPopoverSubStatus("idle");
		}
	}, [editor]);

	// --- Find Clips (opens panel) ---
	const handleFindClips = useCallback(() => {
		useAssetsPanelStore.getState().setActiveTab("audio");
		toast.info(
			"Mudou para o painel de Áudio — use a aba Podcast para encontrar os melhores clipes.",
		);
		setFindClipsStatus("done");
	}, []);

	// --- Smart Cut (one-click filler + silence removal) ---
	const handleSmartCut = useCallback(async () => {
		setSmartCutStatus("running");
		const result = await runSmartCut();
		if (result && result.cuts > 0) {
			setSmartCutStatus("done");
		} else {
			setSmartCutStatus("idle");
		}
	}, [runSmartCut]);

	// Early return AFTER all hooks to satisfy Rules of Hooks
	if (segments.length === 0) return null;

	const effectiveFillerCount =
		fillerStatus === "done" ? fillerCount : currentFillerCount;
	const effectiveSilenceCount =
		silenceStatus === "done" ? silenceCount : currentSilenceCount;

	const actions = [
		{
			id: "smart-cut",
			label: smartCutStatus === "done" ? "Corte concluído" : "Corte inteligente",
			description: "Remove todas as palavras de preenchimento e silêncios em um clique",
			icon: Scissor01Icon,
			status: smartCutStatus,
			handler: handleSmartCut,
		},
		{
			id: "fillers",
			label:
				fillerStatus === "done" && effectiveFillerCount > 0
					? "Remover preenchimentos"
					: currentFillerCount > 0
						? `${currentFillerCount} preenchimentos`
						: "Buscar preenchimentos",
			description:
				fillerStatus === "done" && effectiveFillerCount > 0
					? `${effectiveFillerCount} palavras de preenchimento encontradas — clique para remover`
					: currentFillerCount > 0
						? `${currentFillerCount} palavras de preenchimento detectadas`
						: "Buscar palavras de preenchimento (hã, tipo, né...)",
			icon: Delete02Icon,
			count: effectiveFillerCount > 0 ? effectiveFillerCount : undefined,
			status:
				currentFillerCount > 0 && fillerStatus === "idle"
					? ("done" as ActionStatus)
					: fillerStatus,
			handler: handleFillers,
		},
		{
			id: "silences",
			label:
				silenceStatus === "done" && effectiveSilenceCount > 0
					? `${effectiveSilenceCount} intervalos`
					: currentSilenceCount > 0
						? `${currentSilenceCount} intervalos`
						: "Buscar silêncios",
			description:
				effectiveSilenceCount > 0
					? `${effectiveSilenceCount} intervalos de silêncio detectados entre os trechos`
					: "Detectar pausas longas entre os trechos da transcrição",
			icon: AiMicIcon,
			count: effectiveSilenceCount > 0 ? effectiveSilenceCount : undefined,
			status:
				currentSilenceCount > 0 ? ("done" as ActionStatus) : silenceStatus,
			handler: handleSilences,
		},
		{
			id: "subtitles",
			label: subtitleTrackId ? "Remover legendas" : "Adicionar legendas",
			description: subtitleTrackId
				? "Remover a faixa de legendas da linha do tempo"
				: "Adicionar sobreposição de texto de legenda a partir da transcrição",
			icon: TextIcon,
			status: (subtitleTrackId ? "done" : "idle") as ActionStatus,
			handler: handleSubtitles,
		},
		{
			id: "popover-subs",
			label: popoverSubCount > 0 ? "Adicionar mais legendas" : "Legendas popover",
			description:
				popoverSubCount > 0
					? `${popoverSubCount} conjunto${popoverSubCount > 1 ? "s" : ""} adicionado${popoverSubCount > 1 ? "s" : ""} — clique para adicionar outra camada`
					: "Legendas popover palavra por palavra — cada palavra aparece ao ser falada e permanece visível",
			icon: ClosedCaptionIcon,
			count: popoverSubCount > 0 ? popoverSubCount : undefined,
			status: popoverSubStatus,
			handler: handlePopoverSubs,
		},
		{
			id: "find-clips",
			label: "Buscar clipes",
			description: "Abra o painel de Clipes de Podcast para encontrar os melhores momentos virais",
			icon: Mic01Icon,
			status: findClipsStatus,
			handler: handleFindClips,
		},
		{
			id: "factcheck",
			label: "Verificar fatos",
			description: "Verificar alegações factuais na transcrição",
			icon: CheckmarkBadge01Icon,
			status: factcheckStatus,
			handler: handleFactCheck,
		},
	];

	return (
		<div
			className={cn(
				"flex items-center gap-1.5 rounded-lg border bg-background/95 backdrop-blur-sm px-2 py-1.5 shadow-sm",
				className,
			)}
		>
			<span className="text-[10px] text-muted-foreground font-medium px-1 shrink-0">
				Ações rápidas
			</span>
			<div className="w-px h-4 bg-border shrink-0" />
			{actions.map((action) => (
				<Tooltip key={action.id}>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className={cn(
								"h-7 text-[11px] px-2 gap-1.5",
								action.status === "done" && "text-green-400",
							)}
							disabled={action.status === "running"}
							onClick={action.handler}
						>
							{action.status === "running" ? (
								<Spinner className="size-3" />
							) : action.status === "done" ? (
								<HugeiconsIcon icon={Tick01Icon} className="size-3" />
							) : (
								<HugeiconsIcon icon={action.icon} className="size-3" />
							)}
							{action.label}
							{action.count !== undefined && action.count > 0 && (
								<Badge
									variant="secondary"
									className="text-[9px] px-1 py-0 h-4 min-w-4 justify-center"
								>
									{action.count}
								</Badge>
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-48 text-xs">
						{action.description}
					</TooltipContent>
				</Tooltip>
			))}
		</div>
	);
}
