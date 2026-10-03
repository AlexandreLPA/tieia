import { Button } from "@/components/ui/button";
import { PanelView } from "@/components/editor/panels/assets/views/base-view";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useEffect, useState, useRef } from "react";
import { useEditor } from "@/hooks/use-editor";
import { WHISPER_LANGUAGES } from "@/constants/transcription-constants";
import { LANGUAGES } from "@/constants/language-constants";
import {
	SARVAM_STT_LANGUAGES,
	SARVAM_LANGUAGE_MAP,
	SARVAM_SUPPORTED_CODES,
	isSarvamSTTSupported,
} from "@/constants/sarvam-constants";
import { SMALLEST_STT_LANGUAGES } from "@/constants/smallest-constants";
import type {
	TranscriptionLanguage,
	TranscriptionEngine,
} from "@/types/transcription";
import type { TranscriptionResult } from "@/types/ai";

import { Spinner } from "@/components/ui/spinner";
import { Label } from "@/components/ui/label";
import { useTranscriptStore } from "@/stores/transcript-store";
import { toast } from "sonner";
import { aiClient } from "@/lib/ai-client";
import { useBackgroundTasksStore } from "@/stores/background-tasks-store";
import { downloadBlob } from "@/utils/browser";
import { NLLB_LANGUAGES } from "@/lib/nllb-languages";
import {
	CAPTION_STYLES,
	getCaptionStyle,
	type CaptionSegment,
	type CaptionStyle,
} from "@/lib/captions/caption-styles";
import { addCaptionTrack, CAPTION_Y_OFFSET } from "@/lib/captions/add-captions";
import { useCaptionStyleStore } from "@/stores/caption-style-store";
import { Switch } from "@/components/ui/switch";
import { findTranscribedMediaId } from "@/lib/captions/timeline-mapping";
import { cn } from "@/utils/ui";

interface SubtitleTrackInfo {
	trackId: string;
	language: string;
}

/** Check if we should use Sarvam for translation (Indian language pair).
 *  Requires at least one side to be an Indian language (not just "en"),
 *  AND the other side must also be Sarvam-supported.
 */
const shouldUseSarvamTranslation = (
	sourceLang: string,
	targetLang: string,
): boolean => {
	const sourceIsSarvam = SARVAM_SUPPORTED_CODES.has(sourceLang);
	const targetIsSarvam = SARVAM_SUPPORTED_CODES.has(targetLang);
	// Both must be Sarvam-supported, and at least one must be a non-English Indian language
	const sourceIsIndian = sourceIsSarvam && sourceLang !== "en";
	const targetIsIndian = targetIsSarvam && targetLang !== "en";
	return (sourceIsIndian || targetIsIndian) && sourceIsSarvam && targetIsSarvam;
};

/**
 * Translate transcript segments into a target language.
 *
 * Strategy (privacy-first):
 *   1. NLLB-200 batch translation via the local translate-service (one request,
 *      fully offline). Preferred — no text leaves the host.
 *   2. If NLLB is unavailable AND the pair is Indian-language with a Sarvam
 *      key configured, fall back to Sarvam cloud translation per segment.
 *   3. Final fallback: the local LLM (`translateText`) in small batches.
 *      Slower and lower quality, but always available.
 *
 * Timing (`start`/`end`) is inherited from the source segments — only `text`
 * changes, so no audio re-analysis is needed.
 */
async function translateSegments(
	segments: { text: string; start: number; end: number }[],
	opts: {
		targetCode: string;
		targetName: string;
		sourceCode: string;
		onProgress?: (step: string) => void;
	},
): Promise<{ text: string; start: number; end: number }[]> {
	const { targetCode, targetName, sourceCode, onProgress } = opts;
	const texts = segments.map((s) => s.text);
	const sameLang = sourceCode === targetCode;

	if (sameLang) {
		return segments.map((s) => ({ ...s }));
	}

	// 1. NLLB batch (preferred — local).
	onProgress?.(`Traduzindo para ${targetName} via NLLB…`);
	try {
		const translations = await aiClient.nllbTranslateBatch(
			texts,
			targetCode,
			sourceCode,
		);
		return segments.map((s, i) => ({
			text: translations[i] ?? s.text,
			start: s.start,
			end: s.end,
		}));
	} catch (nllbErr) {
		console.warn("NLLB translation unavailable, falling back:", nllbErr);
	}

	// 2. Sarvam fallback (Indian languages only, cloud).
	if (shouldUseSarvamTranslation(sourceCode, targetCode)) {
		const sourceSarvamCode = SARVAM_LANGUAGE_MAP[sourceCode] || `${sourceCode}-IN`;
		const targetSarvamCode = SARVAM_LANGUAGE_MAP[targetCode] || `${targetCode}-IN`;
		const out: { text: string; start: number; end: number }[] = [];
		for (let i = 0; i < segments.length; i++) {
			onProgress?.(`Traduzindo para ${targetName} (Sarvam) ${i + 1}/${segments.length}`);
			try {
				const result = await aiClient.sarvamTranslate(
					segments[i].text,
					sourceSarvamCode,
					targetSarvamCode,
				);
				out.push({
					text: result.translated_text || segments[i].text,
					start: segments[i].start,
					end: segments[i].end,
				});
			} catch {
				out.push({ ...segments[i] });
			}
		}
		return out;
	}

	// 3. LLM fallback (always available, slower/lower quality).
	const BATCH_SIZE = 5;
	const out: { text: string; start: number; end: number }[] = [];
	for (let i = 0; i < segments.length; i += BATCH_SIZE) {
		const batch = segments.slice(i, i + BATCH_SIZE);
		const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
		const totalBatches = Math.ceil(segments.length / BATCH_SIZE);
		onProgress?.(`Traduzindo para ${targetName} (LLM) ${batchIndex}/${totalBatches}`);
		const numberedLines = batch.map((seg, idx) => `${idx + 1}. ${seg.text}`).join("\n");
		const translated = await aiClient.translateText(numberedLines, targetName);
		const lines = translated
			.split("\n")
			.map((line) => line.replace(/^\d+\.\s*/, "").trim())
			.filter((line) => line.length > 0);
		for (let j = 0; j < batch.length; j++) {
			out.push({
				text: lines[j] || batch[j].text,
				start: batch[j].start,
				end: batch[j].end,
			});
		}
	}
	return out;
}

export function Captions() {
	const [selectedEngine, setSelectedEngine] = useState<TranscriptionEngine>("whisper");
	const [selectedLanguage, setSelectedLanguage] =
		useState<TranscriptionLanguage>("auto");
	const [isProcessing, setIsProcessing] = useState(false);
	const [processingStep, setProcessingStep] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrackInfo[]>([]);
	const [translateLanguage, setTranslateLanguage] = useState("es");
	// Remembered across sessions and shared with the quick "Adicionar legendas"
	const {
		styleId: captionStyleId,
		wordsPerCaption,
		uppercase: uppercaseCaptions,
		setStyleId: setCaptionStyleId,
		setWordsPerCaption,
		setUppercase: setUppercaseCaptions,
	} = useCaptionStyleStore();
	const [isTranslating, setIsTranslating] = useState(false);
	const [translatingStep, setTranslatingStep] = useState("");
	const containerRef = useRef<HTMLDivElement>(null);
	const segments = useTranscriptStore((s) => s.segments);
	const transcriptionRequested = useTranscriptStore(
		(s) => s.transcriptionRequested,
	);
	const editor = useEditor();

	// Determine which languages to show based on engine
	const availableLanguages = selectedEngine === "sarvam"
		? SARVAM_STT_LANGUAGES
		: selectedEngine === "smallest"
			? SMALLEST_STT_LANGUAGES
			: WHISPER_LANGUAGES;

	// Filter out tracks that no longer exist on the timeline (user may have deleted them)
	const timelineTracks = editor.timeline.getTracks();
	const timelineTrackIds = new Set(timelineTracks.map((t) => t.id));
	const activeSubtitleTracks = subtitleTracks.filter((t) =>
		timelineTrackIds.has(t.trackId),
	);

	// Sync state if tracks were removed externally
	if (activeSubtitleTracks.length !== subtitleTracks.length) {
		// Use a microtask to avoid setState during render
		queueMicrotask(() => setSubtitleTracks(activeSubtitleTracks));
	}

	/** Determine the effective engine for a given language code */
	const getEffectiveEngine = (langCode: string): TranscriptionEngine => {
		if (selectedEngine === "sarvam") return "sarvam";
		if (selectedEngine === "smallest") return "smallest";
		// Auto-switch to Sarvam if an Indian language is explicitly selected with Whisper
		if (langCode !== "auto" && isSarvamSTTSupported(langCode) && !WHISPER_LANGUAGES.some(l => l.code === langCode)) {
			return "sarvam";
		}
		return "whisper";
	};

	const handleGenerateTranscript = async () => {
		let failure: string | null = null;
		const fail = (message: string) => {
			failure = message;
			setError(message);
		};
		useTranscriptStore
			.getState()
			.setCaptionsTranscription({ running: true, error: null });
		const taskId = `transcription-${Date.now()}`;
		const bgTasks = useBackgroundTasksStore.getState();

		try {
			setIsProcessing(true);
			setError(null);

			const engine = getEffectiveEngine(selectedLanguage);
			const engineLabel = engine === "sarvam" ? "Sarvam AI" : engine === "smallest" ? "Smallest AI" : "Whisper";

			bgTasks.addTask({
				id: taskId,
				type: "transcription",
				label: `Transcrição (${engineLabel})`,
				progress: "Iniciando...",
			});

			// Remove existing subtitle tracks before re-transcribing
			for (const track of activeSubtitleTracks) {
				try {
					editor.timeline.removeTrack({ trackId: track.trackId });
				} catch {
					// Track may already be gone
				}
			}
			setSubtitleTracks([]);

			// Find the media file from the timeline
			setProcessingStep("Procurando mídia...");
			bgTasks.updateTask(taskId, { progress: "Procurando mídia..." });
			const foundMediaId = findTranscribedMediaId(editor.timeline.getTracks());

			if (!foundMediaId) {
				fail("Nenhum vídeo ou áudio encontrado na linha do tempo. Importe um arquivo primeiro.");
				return;
			}

			const mediaAsset = editor.media
				.getAssets()
				.find((asset) => asset.id === foundMediaId);

			if (!mediaAsset?.file) {
				fail("Não foi possível acessar o arquivo de mídia para transcrição.");
				return;
			}

			// Send to appropriate transcription service
			setProcessingStep(`Transcrevendo via ${engineLabel}...`);
			bgTasks.updateTask(taskId, { progress: `Transcrevendo via ${engineLabel}...` });

			// Ensure the file has a proper extension — the backend rejects files without one
			const mimeToExt: Record<string, string> = {
				"video/mp4": ".mp4",
				"video/webm": ".webm",
				"video/quicktime": ".mov",
				"video/x-matroska": ".mkv",
				"video/avi": ".avi",
				"audio/mpeg": ".mp3",
				"audio/wav": ".wav",
				"audio/x-wav": ".wav",
				"audio/ogg": ".ogg",
				"audio/flac": ".flac",
				"audio/aac": ".aac",
				"audio/mp4": ".m4a",
			};

			let file = mediaAsset.file;
			const fileName = file.name || "";
			const hasExtension = fileName.includes(".") && (fileName.split(".").pop()?.length ?? 0) > 0;

			if (!hasExtension) {
				const ext = mimeToExt[file.type] || ".mp4";
				const newName = fileName ? `${fileName}${ext}` : `media${ext}`;
				file = new File([file], newName, { type: file.type || "video/mp4" });
			}

			let result: TranscriptionResult;
			if (engine === "sarvam") {
				// Use Sarvam AI for Indian languages
				const sarvamLangCode = selectedLanguage === "auto"
					? undefined
					: SARVAM_LANGUAGE_MAP[selectedLanguage] || undefined;
				result = await aiClient.sarvamTranscribe(file, sarvamLangCode);
			} else if (engine === "smallest") {
				// Use Smallest AI Pulse for multilingual STT
				const language = selectedLanguage === "auto" ? "en" : selectedLanguage;
				result = await aiClient.smallestTranscribe(file, language);
			} else {
				// Use Whisper (local)
				const language = selectedLanguage === "auto" ? undefined : selectedLanguage;
				result = await aiClient.transcribe(file, language);
			}

			setProcessingStep("Processando segmentos...");
			bgTasks.updateTask(taskId, { progress: "Processando segmentos..." });

			// Segment times are in the source file, so bound them by its length;
			// the edited timeline can be shorter (silence removal) and used to
			// drop the last phrases
			const sourceDuration =
				result.duration > 0 ? result.duration : editor.timeline.getTotalDuration();

			// Filter out hallucinated segments beyond the actual duration
			// For Sarvam results, also allow Indic Unicode ranges through
			const validSegments = result.segments.filter((seg) => {
				if (seg.start >= sourceDuration) return false;
				// Keep Latin, Cyrillic, CJK, Kana, Devanagari, Bengali, Gurmukhi, Gujarati,
			// Oriya, Tamil, Telugu, Kannada, Malayalam, Sinhala, Arabic/Nastaliq (Urdu),
			// Meitei (Manipuri), Ol Chiki (Santali)
			const cleanText = seg.text.replace(/[^a-zA-Z0-9\u00C0-\u024F\u0400-\u04FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0D80-\u0DFF\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\uABC0-\uABFF\u1C50-\u1C7F]/g, "").trim();
				if (cleanText.length === 0) return false;
				if (seg.end <= seg.start) return false;
				return true;
			}).map((seg) => ({
				...seg,
				end: Math.min(seg.end, sourceDuration),
			}));

			if (validSegments.length === 0) {
				fail("Nenhuma fala detectada no vídeo. Tente outro idioma ou verifique se o vídeo tem áudio.");
				return;
			}

			// Populate transcript store — segments already have word-level detail from backend
			const transcriptSegments = validSegments.map((seg, index) => ({
				id: index,
				text: seg.text,
				start: seg.start,
				end: seg.end,
				words: seg.words && seg.words.length > 0
					? seg.words.map((w) => ({
						word: w.word,
						start: w.start,
						end: w.end,
						confidence: w.confidence,
					}))
					: seg.text.trim().split(/\s+/).map((word, wordIndex, arr) => {
						const segDuration = seg.end - seg.start;
						const wordDuration = segDuration / arr.length;
						return {
							word,
							start: seg.start + wordIndex * wordDuration,
							end: seg.start + (wordIndex + 1) * wordDuration,
							confidence: 0.9,
						};
					}),
			}));

			useTranscriptStore.getState().setSegments(transcriptSegments);
			useTranscriptStore.getState().setLanguage(result.language ?? "en");

			// ── Auto Speaker Diarization + Emotion Detection ──
			// Run both in parallel: speaker labels and emotion annotations.
			setProcessingStep("Detectando falantes e emoções...");
			bgTasks.updateTask(taskId, { progress: "Detectando falantes e emoções..." });

			const speakerPromise = aiClient.analyzeSpeakers(file).catch((err) => {
				console.warn("Speaker diarization failed:", err);
				return null;
			});
			const emotionPromise = aiClient.analyzeEmotions(file).catch((err) => {
				console.warn("Emotion detection failed:", err);
				return null;
			});

			const [speakerResult, emotionResult] = await Promise.all([speakerPromise, emotionPromise]);

			if (speakerResult && speakerResult.segments.length > 0) {
				useTranscriptStore.getState().applySpeakerDiarization(speakerResult.segments);

				const numSpeakers = speakerResult.num_speakers;
				if (numSpeakers > 1) {
					toast.success(`${numSpeakers} falantes detectados`, {
						description: `Método: ${speakerResult.method}. Clique nos nomes dos falantes na transcrição para renomeá-los.`,
					});
				}
			}

			if (emotionResult && emotionResult.emotions.length > 0) {
				useTranscriptStore.getState().setEmotions(emotionResult.emotions);
			}

			// Transcribing must not edit the timeline: it used to split every clip
			// at phrase and speaker boundaries (in source time, so wrong after
			// edits) and separate the audio. Deleting text still cuts the video
			// precisely through the transcript panel.

			setSubtitleTracks([]);

			toast.success(`Transcrição concluída (${engineLabel})`, {
				description: `${validSegments.length} segmentos detectados`,
			});

			bgTasks.updateTask(taskId, {
				status: "completed",
				progress: `${validSegments.length} segmentos`,
				completedAt: Date.now(),
			});
		} catch (err) {
			console.error("Transcription failed:", err);
			const message = err instanceof Error ? err.message : "Ocorreu um erro inesperado";
			if (message.includes("Cannot connect") || message.includes("connection_refused")) {
				fail("Não é possível conectar ao back-end de IA. Verifique se ele está em execução (docker compose up -d).");
			} else if (message.includes("Sarvam API key")) {
				fail("A chave de API do Sarvam não está configurada. Adicione OPENCUTAI_SARVAM_API_KEY ao seu ambiente.");
			} else if (message.includes("Smallest AI API key")) {
				fail("A chave de API do Smallest AI não está configurada. Adicione-a em Configurações > Chaves de API, ou defina OPENCUTAI_SMALLEST_API_KEY no seu ambiente.");
			} else {
				fail(message);
			}
			bgTasks.updateTask(taskId, {
				status: "error",
				error: message,
				completedAt: Date.now(),
			});
		} finally {
			setIsProcessing(false);
			useTranscriptStore
				.getState()
				.setCaptionsTranscription({ running: false, error: failure });
			setProcessingStep("");
		}
	};

	// "Transcrever agora" elsewhere in the app opens this panel and asks for a run
	// biome-ignore lint/correctness/useExhaustiveDependencies: handleGenerateTranscript is recreated every render; the request flag is the trigger
	useEffect(() => {
		if (!transcriptionRequested || isProcessing) return;
		if (useTranscriptStore.getState().takeTranscriptionRequest()) {
			handleGenerateTranscript();
		}
	}, [transcriptionRequested, isProcessing]);

	const addSubtitleTrack = ({
		subtitleSegments,
		languageLabel,
		yOffset,
	}: {
		subtitleSegments: CaptionSegment[];
		languageLabel: string;
		yOffset?: number;
	}) =>
		addCaptionTrack({
			editor,
			segments: subtitleSegments,
			languageLabel,
			yOffset,
		});

	const handleApplyStyleToTracks = (style: CaptionStyle) => {
		const trackIds = new Set(activeSubtitleTracks.map((t) => t.trackId));
		const updates = editor.timeline
			.getTracks()
			.filter((track) => trackIds.has(track.id))
			.flatMap((track) =>
				track.elements
					.filter((element) => element.type === "text")
					.map((element) => ({
						trackId: track.id,
						elementId: element.id,
						updates: style.config,
					})),
			);
		if (updates.length === 0) return;
		editor.timeline.updateElements({ updates });
		toast.success(`Estilo "${style.name}" aplicado a ${updates.length} legendas`);
	};

	const handleAddSubtitles = () => {
		const currentSegments = useTranscriptStore.getState().segments;
		if (currentSegments.length === 0) return;

		const trackId = addSubtitleTrack({
			subtitleSegments: currentSegments.map((seg) => ({
				text: seg.text,
				start: seg.start,
				end: seg.end,
				words: seg.words,
			})),
			languageLabel: "Legenda",
		});

		setSubtitleTracks((prev) => [...prev, { trackId, language: "original" }]);
		toast.success("Legendas adicionadas com destaque de palavras");
	};

	const handleTranslateAndAdd = async () => {
		const currentSegments = useTranscriptStore.getState().segments;
		if (currentSegments.length === 0) return;

		const targetLang = LANGUAGES.find((l) => l.code === translateLanguage);
		if (!targetLang) return;

		const taskId = `translation-${targetLang.code}-${Date.now()}`;
		const bgTasks = useBackgroundTasksStore.getState();

		setIsTranslating(true);
		setError(null);

		bgTasks.addTask({
			id: taskId,
			type: "translation",
			label: `Tradução para ${targetLang.name}`,
			progress: "Iniciando...",
		});

		try {
			const translatedSegments = await translateSegments(currentSegments, {
				targetCode: targetLang.code,
				targetName: targetLang.name,
				sourceCode: useTranscriptStore.getState().language,
				onProgress: (step) => {
					setTranslatingStep(step);
					bgTasks.updateTask(taskId, { progress: step });
				},
			});

			// Place translated subtitles slightly above the original ones
			const yOffset =
				activeSubtitleTracks.length > 0 ? CAPTION_Y_OFFSET - 0.1 : CAPTION_Y_OFFSET;
			const trackId = addSubtitleTrack({
				subtitleSegments: translatedSegments,
				languageLabel: `${targetLang.name}`,
				yOffset,
			});

			setSubtitleTracks((prev) => [
				...prev,
				{ trackId, language: targetLang.code },
			]);

			// Store translation in transcript store for the tabbed panel
			useTranscriptStore.getState().addTranslation({
				languageCode: targetLang.code,
				languageName: targetLang.name,
				segments: translatedSegments.map((seg, idx) => ({
					id: idx,
					text: seg.text,
					start: seg.start,
					end: seg.end,
					words: [],
				})),
			});

			bgTasks.updateTask(taskId, {
				status: "completed",
				progress: `${translatedSegments.length} segmentos`,
				completedAt: Date.now(),
			});
		} catch (err) {
			console.error("Translation failed:", err);
			const message =
				err instanceof Error ? err.message : "Falha na tradução";
			if (
				message.includes("Cannot connect") ||
				message.includes("connection_refused")
			) {
				setError(
					"Não é possível conectar ao back-end de IA. Verifique se ele está em execução e se um modelo de LLM está carregado.",
				);
			} else if (message.includes("Sarvam API key")) {
				setError("A chave de API do Sarvam não está configurada. Adicione OPENCUTAI_SARVAM_API_KEY ao seu ambiente.");
			} else if (message.includes("Smallest AI API key")) {
				setError("A chave do Smallest AI não está configurada. Adicione-a em Configurações > Chaves de API, ou defina OPENCUTAI_SMALLEST_API_KEY no seu ambiente.");
			} else {
				setError(message);
			}
			bgTasks.updateTask(taskId, {
				status: "error",
				error: message,
				completedAt: Date.now(),
			});
		} finally {
			setIsTranslating(false);
			setTranslatingStep("");
		}
	};

	const handleRemoveSubtitles = () => {
		for (const track of subtitleTracks) {
			try {
				editor.timeline.removeTrack({ trackId: track.trackId });
			} catch {
				// Track may already have been removed manually
			}
		}
		setSubtitleTracks([]);
		toast.success("Todas as faixas de legenda foram removidas");
	};

	const handleRemoveSingleTrack = (trackId: string) => {
		try {
			editor.timeline.removeTrack({ trackId });
		} catch {
			// Already removed
		}
		setSubtitleTracks((prev) => prev.filter((t) => t.trackId !== trackId));
		toast.success("Faixa de legenda removida");
	};

	const handleExportSubtitles = async (
		track: SubtitleTrackInfo,
		format: "srt" | "vtt",
	) => {
		// Prefer the stored translation (clean text); fall back to the live
		// timeline track's text elements if no translation is stored.
		const stored = useTranscriptStore
			.getState()
			.translations.find((t) => t.languageCode === track.language);
		const segments = stored?.segments ?? [];
		if (segments.length === 0) {
			toast.error("Nenhum segmento para exportar nesta faixa.");
			return;
		}
		const taskId = `sub-export-${track.language}-${Date.now()}`;
		useBackgroundTasksStore.getState().addTask({
			id: taskId,
			type: "popover-subs",
			label: `Exportando ${track.language}.${format}`,
			progress: "Gerando…",
		});
		try {
			const result = await aiClient.generateSubtitles(segments, format);
			const blob = new Blob([result.content], {
				type: format === "srt" ? "application/x-subrip" : "text/vtt",
			});
			downloadBlob({
				blob,
				filename: `subtitles-${track.language}.${format}`,
			});
			useBackgroundTasksStore.getState().updateTask(taskId, {
				status: "completed",
				progress: "Baixado",
				completedAt: Date.now(),
			});
			toast.success(`Exportado: subtitles-${track.language}.${format}`);
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Falha na exportação";
			useBackgroundTasksStore.getState().updateTask(taskId, {
				status: "error",
				error: msg,
				completedAt: Date.now(),
			});
			toast.error("Falha ao exportar legenda", { description: msg });
		}
	};

	const handleLanguageChange = ({ value }: { value: string }) => {
		if (value === "auto") {
			setSelectedLanguage("auto");
			return;
		}
		setSelectedLanguage(value as TranscriptionLanguage);
	};

	const handleEngineChange = (value: string) => {
		const engine = value as TranscriptionEngine;
		setSelectedEngine(engine);
		// Reset language to auto when switching engines
		setSelectedLanguage("auto");
	};

	return (
		<PanelView title="Legendas" ref={containerRef}>
			<div className="flex flex-col gap-5">
				<p className="text-xs text-muted-foreground leading-relaxed">
					Transcreva seu vídeo para editá-lo como um documento. Exclua trechos, remova vícios de linguagem ou reordene segmentos.
				</p>

				{/* ── Engine Selector ── */}
				<div className="flex flex-col gap-2">
					<Label className="text-xs">Motor de transcrição</Label>
					<Select value={selectedEngine} onValueChange={handleEngineChange}>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="whisper">
								Whisper (Local)
							</SelectItem>
							<SelectItem value="sarvam">
								Sarvam AI (idiomas indianos)
							</SelectItem>
							<SelectItem value="smallest">
								Smallest AI Pulse (39 idiomas)
							</SelectItem>
						</SelectContent>
					</Select>
					<p className="text-[10px] text-muted-foreground">
						{selectedEngine === "sarvam"
							? "Baseado em nuvem, otimizado para 22 idiomas regionais indianos"
							: selectedEngine === "smallest"
								? "Baseado em nuvem, 39 idiomas com diarização de falantes e detecção de emoções"
								: "No dispositivo, ideal para idiomas globais (inglês, espanhol, francês etc.)"}
					</p>
				</div>

				{/* ── Language Selector ── */}
				<div className="flex flex-col gap-2">
					<Label className="text-xs">Idioma</Label>
					<Select
						value={selectedLanguage}
						onValueChange={(value) => handleLanguageChange({ value })}
					>
						<SelectTrigger>
							<SelectValue placeholder="Selecione um idioma" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="auto">Detecção automática</SelectItem>
							{selectedEngine === "sarvam" ? (
								<>
									<SelectGroup>
										<SelectLabel className="text-[10px] text-muted-foreground px-2">
											Idiomas regionais indianos
										</SelectLabel>
										{SARVAM_STT_LANGUAGES.filter(l => l.code !== "en").map((language) => (
											<SelectItem key={language.code} value={language.code}>
												{language.name}
											</SelectItem>
										))}
									</SelectGroup>
									<SelectGroup>
										<SelectLabel className="text-[10px] text-muted-foreground px-2">
											Inglês
										</SelectLabel>
										<SelectItem value="en">
											Inglês (indiano)
										</SelectItem>
									</SelectGroup>
								</>
							) : (
								availableLanguages.map((language) => (
									<SelectItem key={language.code} value={language.code}>
										{language.name}
									</SelectItem>
								))
							)}
						</SelectContent>
					</Select>
				</div>

				{error && (
					<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
						<p className="text-destructive text-sm">{error}</p>
					</div>
				)}

				{segments.length > 0 && activeSubtitleTracks.length === 0 && (
					<p className="text-[11px] text-muted-foreground leading-relaxed rounded-md bg-muted/50 px-3 py-2">
						A transcrição está pronta. Adicione legendas abaixo ou retranscreva se o vídeo mudou.
					</p>
				)}

				<Button
					className="w-full"
					variant={segments.length > 0 ? "outline" : "default"}
					onClick={handleGenerateTranscript}
					disabled={isProcessing}
				>
					{isProcessing && <Spinner className="mr-1" />}
					{isProcessing
						? processingStep
						: segments.length > 0
							? "Retranscrever"
							: "Gerar transcrição"}
				</Button>

				{segments.length > 0 && (
					<>
						{/* ── Caption Style ── */}
						<div className="border-t pt-4 flex flex-col gap-3">
							<Label className="text-xs">Estilo das legendas</Label>
							<div className="grid grid-cols-2 gap-1.5">
								{CAPTION_STYLES.map((style) => (
									<CaptionStyleTile
										key={style.id}
										style={style}
										selected={style.id === captionStyleId}
										uppercase={uppercaseCaptions}
										onSelect={() => {
											setCaptionStyleId(style.id);
											if (style.recommendedWords !== undefined) {
												setWordsPerCaption(style.recommendedWords);
											}
										}}
									/>
								))}
							</div>
							<div className="flex flex-col gap-1.5">
								<Label className="text-xs">Palavras por vez</Label>
								<div className="flex flex-wrap gap-1">
									{WORDS_PER_CAPTION_OPTIONS.map((option) => (
										<Button
											key={option.value}
											size="sm"
											variant={
												wordsPerCaption === option.value ? "secondary" : "outline"
											}
											className={cn(
												"h-6 min-w-0 px-2 text-[10px]",
												wordsPerCaption === option.value && "ring-1 ring-primary",
											)}
											onClick={() => setWordsPerCaption(option.value)}
										>
											{option.label}
										</Button>
									))}
								</div>
							</div>
							<div className="flex items-center justify-between gap-2">
								<Label htmlFor="caption-uppercase" className="text-xs">
									Tudo em maiúsculas
								</Label>
								<Switch
									id="caption-uppercase"
									checked={uppercaseCaptions}
									onCheckedChange={setUppercaseCaptions}
								/>
							</div>
							{activeSubtitleTracks.length > 0 && (
								<>
									<Button
										variant="secondary"
										size="sm"
										className="w-full"
										onClick={() =>
											handleApplyStyleToTracks(getCaptionStyle(captionStyleId))
										}
									>
										Aplicar estilo nas legendas atuais
									</Button>
									<p className="text-[10px] leading-snug text-muted-foreground">
										Palavras por vez e maiúsculas valem ao adicionar. Para
										mudar, remova as legendas e adicione de novo.
									</p>
								</>
							)}
						</div>

						{/* ── Subtitle Tracks ── */}
						<div className="border-t pt-4 flex flex-col gap-3">
							<div className="flex items-center justify-between">
								<Label className="text-xs">Faixas de legenda</Label>
								{activeSubtitleTracks.length > 0 && (
									<span className="text-[10px] text-muted-foreground tabular-nums">
										{activeSubtitleTracks.length} ativa{activeSubtitleTracks.length !== 1 ? "s" : ""}
									</span>
								)}
							</div>

							{activeSubtitleTracks.length > 0 ? (
								<div className="flex flex-col gap-1.5">
									{activeSubtitleTracks.map((track) => {
										const langName =
											track.language === "original"
												? "Original"
												: LANGUAGES.find((l) => l.code === track.language)
														?.name ?? track.language;
										return (
											<div
												key={track.trackId}
												className="flex items-center justify-between rounded-md border px-3 py-2"
											>
									<div className="flex items-center gap-2">
										<span className="bg-primary size-1.5 rounded-full shrink-0" />
										<span className="text-sm font-medium">
											{langName}
										</span>
									</div>
									<div className="flex items-center gap-1">
										{track.language !== "original" && (
											<>
												<Button
													variant="ghost"
													size="sm"
													className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
													onClick={() =>
														handleExportSubtitles(track, "srt")
													}
												>
													SRT
												</Button>
												<Button
													variant="ghost"
													size="sm"
													className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
													onClick={() =>
														handleExportSubtitles(track, "vtt")
													}
												>
													VTT
												</Button>
											</>
										)}
										<Button
											variant="ghost"
											size="sm"
											className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
											onClick={() =>
												handleRemoveSingleTrack(track.trackId)
											}
										>
											Remover
										</Button>
									</div>
											</div>
										);
									})}
									<Button
										variant="outline"
										size="sm"
										className="w-full text-destructive hover:text-destructive"
										onClick={handleRemoveSubtitles}
									>
										Remover todas
									</Button>
								</div>
							) : (
								<Button
									variant="outline"
									className="w-full"
									onClick={handleAddSubtitles}
								>
									Adicionar legendas
								</Button>
							)}
						</div>

						{/* ── Add Language ── */}
						<div className="border-t pt-4 flex flex-col gap-3">
							<Label className="text-xs">Adicionar idioma</Label>
							<p className="text-[11px] text-muted-foreground leading-relaxed">
								Traduz usando o serviço local NLLB-200 (totalmente offline).
								Recorre ao Sarvam AI para idiomas indianos ou ao LLM local caso o
								NLLB não esteja disponível.
							</p>

							{/* Quick-add chips: batch-translate into several languages. */}
							<div className="flex flex-wrap gap-1">
								{NLLB_LANGUAGES.filter(
									(l) =>
										l.code !==
											useTranscriptStore.getState().language &&
										!activeSubtitleTracks.some(
											(t) => t.language === l.code,
										),
								).map((lang) => (
									<button
										key={lang.code}
										type="button"
										disabled={isTranslating}
										onClick={() => {
											setTranslateLanguage(lang.code);
											// Defer so state settles before the handler reads it.
											setTimeout(() => handleTranslateAndAdd(), 0);
										}}
										className="rounded-full border border-border px-2 py-0.5 text-[10px] hover:bg-accent disabled:opacity-50 transition-colors"
									>
										{lang.name}
									</button>
								))}
							</div>
							<div className="flex gap-2">
								<Select
									value={translateLanguage}
									onValueChange={setTranslateLanguage}
								>
									<SelectTrigger className="flex-1">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											<SelectLabel className="text-[10px] text-muted-foreground px-2">
												Idiomas globais
											</SelectLabel>
											{LANGUAGES.filter(
												(lang) =>
													!SARVAM_SUPPORTED_CODES.has(lang.code) &&
													!activeSubtitleTracks.some(
														(t) => t.language === lang.code,
													),
											).map((lang) => (
												<SelectItem key={lang.code} value={lang.code}>
													{lang.name}
												</SelectItem>
											))}
										</SelectGroup>
										<SelectGroup>
											<SelectLabel className="text-[10px] text-muted-foreground px-2">
												Idiomas indianos (via Sarvam AI)
											</SelectLabel>
											{LANGUAGES.filter(
												(lang) =>
													SARVAM_SUPPORTED_CODES.has(lang.code) &&
													lang.code !== "en" &&
													!activeSubtitleTracks.some(
														(t) => t.language === lang.code,
													),
											).map((lang) => (
												<SelectItem key={lang.code} value={lang.code}>
													{lang.name}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
								<Button
									onClick={handleTranslateAndAdd}
									disabled={isTranslating}
									className="shrink-0"
								>
									{isTranslating && <Spinner className="mr-1" />}
									{isTranslating ? "..." : "Adicionar"}
								</Button>
							</div>
							{isTranslating && translatingStep && (
								<p className="text-[11px] text-muted-foreground animate-pulse">
									{translatingStep}
								</p>
							)}
						</div>
					</>
				)}
			</div>
		</PanelView>
	);
}

const WORDS_PER_CAPTION_OPTIONS = [
	{ value: 1, label: "1" },
	{ value: 2, label: "2" },
	{ value: 3, label: "3" },
	{ value: 5, label: "5" },
	{ value: 0, label: "Frase" },
];

/** Mini preview of a caption style; the middle word plays the spoken one */
function CaptionStyleTile({
	style,
	selected,
	uppercase,
	onSelect,
}: {
	style: CaptionStyle;
	selected: boolean;
	uppercase: boolean;
	onSelect: () => void;
}) {
	const { config } = style;
	const words = ["olha", "só", "isso"].map((word) =>
		uppercase ? word.toUpperCase() : word,
	);
	const textStyle: React.CSSProperties = {
		color: config.color,
		fontWeight: config.fontWeight === "bold" ? 800 : 400,
		...(config.stroke?.enabled && {
			WebkitTextStroke: `${Math.max(1, config.stroke.width / 4)}px ${config.stroke.color}`,
			paintOrder: "stroke fill",
		}),
		...(config.shadow?.enabled && {
			textShadow: `0 2px 4px ${config.shadow.color}`,
		}),
	};
	const activeStyle: React.CSSProperties =
		config.highlightStyle === "box"
			? {
					backgroundColor: config.highlightColor,
					borderRadius: 3,
					padding: "0 3px",
				}
			: config.highlightStyle === "none"
				? {}
				: { color: config.highlightColor };

	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={selected}
			className={cn(
				"flex flex-col gap-1 rounded-md border p-1.5 text-left",
				"hover:bg-accent/60 focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none",
				selected && "border-primary bg-primary/10",
			)}
		>
			<span className="flex h-9 items-center justify-center gap-1 rounded bg-gradient-to-br from-slate-500 to-slate-700 text-[13px]">
				<span
					style={{
						...textStyle,
						...(config.background.enabled && {
							backgroundColor: config.background.color,
							borderRadius: 3,
							padding: "1px 4px",
						}),
					}}
				>
					{words[0]} <span style={activeStyle}>{words[1]}</span> {words[2]}
				</span>
			</span>
			<span className="truncate px-0.5 text-[10px] leading-tight">
				{style.name}
			</span>
		</button>
	);
}

