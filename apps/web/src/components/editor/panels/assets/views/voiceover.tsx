"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanelView } from "./base-view";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useEditor } from "@/hooks/use-editor";
import { useTranscriptStore } from "@/stores/transcript-store";
import { aiClient } from "@/lib/ai-client";
import { useBackgroundTasksStore } from "@/stores/background-tasks-store";
import { buildUploadAudioElement } from "@/lib/timeline/element-utils";
import { cn } from "@/utils/ui";
import { toast } from "sonner";
import {
	SARVAM_TTS_LANGUAGES,
	SARVAM_LANGUAGE_MAP,
	SARVAM_TTS_SPEAKERS,
	SARVAM_DEFAULT_SPEAKER,
} from "@/constants/sarvam-constants";
import {
	SMALLEST_TTS_LANGUAGES,
	SMALLEST_TTS_VOICES,
	SMALLEST_DEFAULT_VOICE,
	getSmallestVoicesForLanguage,
} from "@/constants/smallest-constants";
import { CHATTERBOX_LANGUAGES } from "@/lib/voiceover/chatterbox";
import {
	ChatterboxVoice,
	DEFAULT_CHATTERBOX_SETTINGS,
	type ChatterboxSettings,
	type ChatterboxTakeMetrics,
} from "./chatterbox-voice";
import type { ReferenceAnalysis } from "@/types/ai";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TTSEngine = "local" | "chatterbox" | "sarvam" | "smallest";

const TTS_MODELS = [
	{ id: "xtts_v2", name: "Coqui XTTS v2", description: "Multilingual with voice cloning", size: "~1.8 GB", supportsCloning: true, quality: "Alta", speed: "Lenta", installed: true },
	{ id: "styletts2", name: "StyleTTS 2", description: "Human-level quality with style transfer", size: "~500 MB", supportsCloning: true, quality: "Muito alta", speed: "Média", installed: false },
	{ id: "bark", name: "Bark (Suno)", description: "Expressive speech with emotions", size: "~5 GB", supportsCloning: false, quality: "Muito alta", speed: "Muito lenta", installed: false },
	{ id: "piper", name: "Piper", description: "Fast and lightweight", size: "~50 MB/voice", supportsCloning: false, quality: "Boa", speed: "Muito rápida", installed: false },
	{ id: "fish-speech", name: "Fish Speech", description: "Multilingual zero-shot voice cloning", size: "~1 GB", supportsCloning: true, quality: "Alta", speed: "Rápida", installed: false },
	{ id: "kokoro", name: "Kokoro TTS", description: "Small, fast, surprisingly natural", size: "~80 MB", supportsCloning: false, quality: "Alta", speed: "Muito rápida", installed: false },
];

const COQUI_LANGUAGES = [
	{ code: "en", name: "Inglês" },
	{ code: "es", name: "Espanhol" },
	{ code: "fr", name: "Francês" },
	{ code: "de", name: "Alemão" },
	{ code: "it", name: "Italiano" },
	{ code: "pt", name: "Português" },
	{ code: "ja", name: "Japonês" },
	{ code: "zh-cn", name: "Chinês" },
	{ code: "ko", name: "Coreano" },
	{ code: "ru", name: "Russo" },
	{ code: "ar", name: "Árabe" },
	{ code: "tr", name: "Turco" },
];

const ALL_TTS_LANGUAGES = [
	...COQUI_LANGUAGES,
	...CHATTERBOX_LANGUAGES.filter((l) => !COQUI_LANGUAGES.some((c) => c.code === l.code)),
	...SARVAM_TTS_LANGUAGES.filter((l) => l.code !== "en"),
	...SMALLEST_TTS_LANGUAGES.filter(
		(l) => !COQUI_LANGUAGES.some((c) => c.code === l.code) && !SARVAM_TTS_LANGUAGES.some((s) => s.code === l.code),
	),
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VoiceoverView() {
	const editor = useEditor();
	const segments = useTranscriptStore((s) => s.segments);
	const hasTranscript = segments.length > 0;

	// Engine selection — top-level toggle
	const [engine, setEngine] = useState<TTSEngine>("local");

	// Shared state
	const [language, setLanguage] = useState("en");
	const [customText, setCustomText] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);
	const [generationProgress, setGenerationProgress] = useState("");
	const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
	const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [useTranscript, setUseTranscript] = useState(true);
	const audioRef = useRef<HTMLAudioElement>(null);

	// Local engine state
	const [selectedModel, setSelectedModel] = useState("xtts_v2");
	const [voiceGender, setVoiceGender] = useState<"male" | "female">("male");
	const [clonedVoicePath, setClonedVoicePath] = useState<string | null>(null);
	const [clonedVoiceName, setClonedVoiceName] = useState<string | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Chatterbox engine state (its reference lives in chatterbox-service, apart from Coqui's)
	const [chatterboxSettings, setChatterboxSettings] = useState<ChatterboxSettings>(DEFAULT_CHATTERBOX_SETTINGS);
	const [chatterboxVoice, setChatterboxVoice] = useState<{ name: string; path: string } | null>(null);
	const [referenceAnalysis, setReferenceAnalysis] = useState<ReferenceAnalysis | null>(null);
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [lastTake, setLastTake] = useState<ChatterboxTakeMetrics | null>(null);

	// Sarvam engine state
	const [sarvamSpeaker, setSarvamSpeaker] = useState(SARVAM_DEFAULT_SPEAKER);

	// Smallest AI engine state
	const [smallestVoice, setSmallestVoice] = useState(SMALLEST_DEFAULT_VOICE);
	const [smallestSpeed, setSmallestSpeed] = useState(1.0);

	const currentModel = TTS_MODELS.find((m) => m.id === selectedModel) ?? TTS_MODELS[0];

	// Available voices for the selected language (Smallest)
	const smallestVoicesForLang = useMemo(
		() => getSmallestVoicesForLanguage(language),
		[language],
	);

	// Reset language when switching engine
	const handleEngineChange = (value: string) => {
		const e = value as TTSEngine;
		setEngine(e);
		if (e === "sarvam") setLanguage("hi");
		else if (e === "chatterbox") setLanguage("pt");
		else if (e === "smallest") setLanguage("en");
		else setLanguage("en");
	};

	// Auto-select cloning model when voice is uploaded
	useEffect(() => {
		if (clonedVoicePath) {
			const cloningModel = TTS_MODELS.find((m) => m.supportsCloning && m.installed);
			if (cloningModel) setSelectedModel(cloningModel.id);
		}
	}, [clonedVoicePath]);

	// Text to generate from
	const textToGenerate = useMemo(() => {
		if (useTranscript && hasTranscript) {
			return segments.map((s) => s.text).join(" ").trim();
		}
		return customText.trim();
	}, [useTranscript, hasTranscript, segments, customText]);

	// Check if translation is needed
	const transcriptLanguage = useTranscriptStore((s) => s.language) || "en";
	const needsTranslation = useTranscript && hasTranscript && language !== transcriptLanguage && language !== "en";

	const addTask = useBackgroundTasksStore((s) => s.addTask);
	const updateTask = useBackgroundTasksStore((s) => s.updateTask);

	// Translate text for TTS
	const translateForTTS = useCallback(async (text: string, taskId?: string): Promise<string> => {
		if (!needsTranslation) return text;
		const langName = ALL_TTS_LANGUAGES.find((l) => l.code === language)?.name ?? language;
		const progress = `Traduzindo para ${langName}...`;
		setGenerationProgress(progress);
		if (taskId) updateTask(taskId, { progress });

		if (engine === "sarvam") {
			const sourceSarvamCode = SARVAM_LANGUAGE_MAP[transcriptLanguage] || `${transcriptLanguage}-IN`;
			const targetSarvamCode = SARVAM_LANGUAGE_MAP[language] || `${language}-IN`;
			try {
				const result = await aiClient.sarvamTranslate(text, sourceSarvamCode, targetSarvamCode);
				return result.translated_text || text;
			} catch {
				return await aiClient.translateText(text, langName);
			}
		}
		return await aiClient.translateText(text, langName);
	}, [needsTranslation, language, engine, transcriptLanguage, updateTask]);

	// Generate speech using the selected engine
	const generateSpeech = useCallback(async (text: string): Promise<Blob> => {
		if (engine === "sarvam") {
			const sarvamCode = SARVAM_LANGUAGE_MAP[language] || `${language}-IN`;
			return aiClient.sarvamTTS(text, sarvamCode, sarvamSpeaker);
		}
		if (engine === "smallest") {
			return aiClient.smallestTTS(text, smallestVoice, language, smallestSpeed);
		}
		if (engine === "chatterbox") {
			const take = await aiClient.generateChatterbox({
				text,
				language,
				speakerWav: chatterboxVoice?.path,
				...chatterboxSettings,
			});
			setLastTake({ similarity: take.similarity, wordsPerMinute: take.wordsPerMinute, seed: take.seed });
			return take.blob;
		}
		return aiClient.generateSpeechBlob({
			text,
			language,
			speakerWav: clonedVoicePath ?? undefined,
			speaker: clonedVoicePath ? undefined : voiceGender,
		});
	}, [engine, language, sarvamSpeaker, smallestVoice, smallestSpeed, chatterboxVoice, chatterboxSettings, clonedVoicePath, voiceGender]);

	// Generate full voiceover
	const handleGenerate = useCallback(async () => {
		if (!textToGenerate) {
			toast.error("Nenhum texto para gerar fala");
			return;
		}

		const taskId = `vo-full-${Date.now()}`;
		addTask({ id: taskId, type: "voiceover", label: "Gerando narração", progress: "Preparando..." });

		setIsGenerating(true);
		setError(null);
		setGeneratedAudioUrl(null);
		setGeneratedBlob(null);
		setLastTake(null);
		setGenerationProgress("Preparando texto...");

		try {
			const ttsText = await translateForTTS(textToGenerate, taskId);
			setGenerationProgress("Gerando fala...");
			updateTask(taskId, { progress: "Gerando fala..." });

			const blob = await generateSpeech(ttsText);

			const url = URL.createObjectURL(blob);
			setGeneratedAudioUrl(url);
			setGeneratedBlob(blob);
			setGenerationProgress("");
			updateTask(taskId, { status: "completed", completedAt: Date.now() });
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Falha na geração";
			setError(msg);
			setGenerationProgress("");
			updateTask(taskId, { status: "error", error: msg, completedAt: Date.now() });
		} finally {
			setIsGenerating(false);
		}
	}, [textToGenerate, translateForTTS, generateSpeech, addTask, updateTask]);

	// Generated speech becomes a media asset of the project, as recordings and
	// generated music do, so it is still there after a reload (a blob: URL on the
	// element would not be).
	const insertVoice = useCallback(async ({ blob, fileName, name, startTime, trackId, fallbackDuration }: {
		blob: Blob;
		fileName: string;
		name: string;
		startTime: number;
		trackId: string;
		fallbackDuration: number;
	}) => {
		const file = new File([blob], fileName, { type: "audio/wav" });
		const url = URL.createObjectURL(file);
		const duration = (await getAudioDuration(url)) || fallbackDuration;
		const mediaId = await editor.media.addMediaAsset({
			projectId: editor.project.getActive().metadata.id,
			asset: { name: fileName, type: "audio", file, url, duration },
		});
		editor.timeline.insertElement({
			placement: { mode: "explicit", trackId },
			element: buildUploadAudioElement({ mediaId, name, duration, startTime }),
		});
	}, [editor]);

	// Generate per-segment and auto-add to timeline
	const handleGeneratePerSegment = useCallback(async () => {
		if (!hasTranscript || segments.length === 0) {
			toast.error("Nenhum segmento de transcrição disponível para gerar");
			return;
		}

		const taskId = `vo-seg-${Date.now()}`;
		const langName = ALL_TTS_LANGUAGES.find((l) => l.code === language)?.name ?? language;
		addTask({ id: taskId, type: "voiceover", label: `Narração (${segments.length} segmentos)`, progress: "Iniciando..." });

		setIsGenerating(true);
		setError(null);

		const trackId = editor.timeline.addTrack({ type: "audio", index: 0 });

		try {
			for (let i = 0; i < segments.length; i++) {
				const seg = segments[i];
				const originalText = seg.text.trim();
				if (!originalText) continue;

				let ttsText = originalText;
				if (needsTranslation) {
					const progress = `Traduzindo ${i + 1}/${segments.length} para ${langName}...`;
					setGenerationProgress(progress);
					updateTask(taskId, { progress });
					ttsText = await translateForTTS(originalText, taskId);
				}

				const progress = `Gerando ${i + 1}/${segments.length}...`;
				setGenerationProgress(progress);
				updateTask(taskId, { progress });

				const blob = await generateSpeech(ttsText);

				await insertVoice({
					blob,
					fileName: `voiceover_seg_${i}_${Date.now()}.wav`,
					name: `Voz [${language}]: ${originalText.slice(0, 25)}...`,
					startTime: seg.start,
					trackId,
					fallbackDuration: seg.end - seg.start,
				});
			}

			setGenerationProgress("");
			updateTask(taskId, { status: "completed", completedAt: Date.now() });
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Falha na geração";
			setError(msg);
			setGenerationProgress("");
			updateTask(taskId, { status: "error", error: msg, completedAt: Date.now() });
		} finally {
			setIsGenerating(false);
		}
	}, [segments, hasTranscript, language, needsTranslation, editor, translateForTTS, generateSpeech, insertVoice, addTask, updateTask]);

	// Add full voiceover to timeline
	const handleAddToTimeline = useCallback(async () => {
		if (!generatedBlob) return;

		const trackId = editor.timeline.addTrack({ type: "audio", index: 0 });
		await insertVoice({
			blob: generatedBlob,
			fileName: `narracao_${Date.now()}.wav`,
			name: "Narração",
			startTime: editor.playback.getCurrentTime(),
			trackId,
			fallbackDuration: 5,
		});

		toast.success("Narração adicionada à linha do tempo");
	}, [editor, generatedBlob, insertVoice]);

	// Upload voice sample for cloning (local engine only)
	const handleUploadVoice = useCallback(async (file: File) => {
		setIsUploading(true);
		setError(null);
		try {
			const result = await aiClient.cloneVoice(file, file.name.replace(/\.[^.]+$/, ""));
			setClonedVoicePath(result.path);
			setClonedVoiceName(result.name);
			toast.success(`Voz "${result.name}" pronta para clonagem`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Falha na clonagem de voz");
		} finally {
			setIsUploading(false);
		}
	}, []);

	// Upload a reference for Chatterbox, then check what it is worth for a clone
	const handleUploadChatterboxVoice = useCallback(async (file: File) => {
		setIsUploading(true);
		setError(null);
		setReferenceAnalysis(null);
		setLastTake(null);
		try {
			const result = await aiClient.cloneChatterboxVoice(file, file.name.replace(/\.[^.]+$/, ""));
			setChatterboxVoice({ name: result.name, path: result.path });
			toast.success(`Voz "${result.name}" pronta para clonagem`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Falha ao enviar a voz");
		} finally {
			setIsUploading(false);
		}
	}, []);

	useEffect(() => {
		if (!chatterboxVoice) return;
		let cancelled = false;
		setIsAnalyzing(true);
		aiClient
			.analyzeChatterboxReference(chatterboxVoice.path)
			.then((analysis) => {
				if (!cancelled) setReferenceAnalysis(analysis);
			})
			.catch((err) => {
				if (!cancelled) toast.error(err instanceof Error ? err.message : "Falha ao analisar a gravação");
			})
			.finally(() => {
				if (!cancelled) setIsAnalyzing(false);
			});
		return () => {
			cancelled = true;
		};
	}, [chatterboxVoice]);

	// Can generate?
	const canGenerate = engine !== "local" || currentModel.installed;

	return (
		<PanelView title="Narração">
			<div className="flex flex-col gap-4">

				{/* ── Source text ── */}
				{hasTranscript && (
					<div className="flex flex-col gap-2">
						<div className="flex items-center gap-2">
							<Label className="text-xs flex-1">Origem</Label>
							<button
								type="button"
								className={cn(
									"text-[10px] px-2 py-0.5 rounded-full border transition-colors",
									useTranscript ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-accent",
								)}
								onClick={() => setUseTranscript(true)}
							>
								Transcrição
							</button>
							<button
								type="button"
								className={cn(
									"text-[10px] px-2 py-0.5 rounded-full border transition-colors",
									!useTranscript ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-accent",
								)}
								onClick={() => setUseTranscript(false)}
							>
								Texto personalizado
							</button>
						</div>

						{useTranscript && (
							<div className="rounded-md bg-muted/50 px-2.5 py-2 max-h-24 overflow-y-auto">
								<p className="text-[10px] text-muted-foreground leading-relaxed">
									{segments.map((s) => s.text).join(" ").slice(0, 500)}
									{segments.map((s) => s.text).join(" ").length > 500 && "..."}
								</p>
							</div>
						)}
					</div>
				)}

				{(!hasTranscript || !useTranscript) && (
					<div className="flex flex-col gap-2">
						<Label className="text-xs">Texto</Label>
						<textarea
							value={customText}
							onChange={(e) => setCustomText(e.target.value)}
							placeholder="Digite ou cole o texto para converter em fala..."
							rows={4}
							maxLength={5000}
							className={cn(
								"w-full resize-none rounded-md border bg-transparent px-2.5 py-2 text-xs outline-none",
								"focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40",
							)}
						/>
					</div>
				)}

				{/* ── Engine selector ── */}
				<div className="flex flex-col gap-2">
					<Label className="text-xs">Mecanismo de voz</Label>
					<Select value={engine} onValueChange={handleEngineChange}>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="local">Local (Coqui XTTS)</SelectItem>
							<SelectItem value="chatterbox">Local (Chatterbox, clonagem)</SelectItem>
							<SelectItem value="sarvam">Sarvam AI (idiomas indianos)</SelectItem>
							<SelectItem value="smallest">Smallest AI (Lightning TTS)</SelectItem>
						</SelectContent>
					</Select>
					<p className="text-[10px] text-muted-foreground">
						{engine === "sarvam"
							? "Nuvem — 10 idiomas indianos, mais de 37 vozes naturais"
							: engine === "smallest"
								? "Nuvem — 15 idiomas, mais de 80 vozes, ~100ms de latência"
								: engine === "chatterbox"
									? "No dispositivo (GPU) — 23 idiomas, clonagem a partir de 10 s de fala, com nota de semelhança"
									: "No dispositivo — 12 idiomas globais, clonagem de voz"}
					</p>
				</div>

				{/* ── Engine-specific UI ── */}
				{engine === "chatterbox" ? (
					<ChatterboxVoice
						language={language}
						onLanguageChange={setLanguage}
						needsTranslation={needsTranslation}
						settings={chatterboxSettings}
						onSettingsChange={setChatterboxSettings}
						voiceName={chatterboxVoice?.name ?? null}
						isUploading={isUploading}
						onUploadVoice={handleUploadChatterboxVoice}
						onRemoveVoice={() => {
							setChatterboxVoice(null);
							setReferenceAnalysis(null);
							setLastTake(null);
						}}
						analysis={referenceAnalysis}
						isAnalyzing={isAnalyzing}
						lastTake={lastTake}
					/>
				) : engine === "sarvam" ? (
					<>
						{/* Sarvam: Language */}
						<div className="flex flex-col gap-2">
							<Label className="text-xs">Idioma</Label>
							<Select value={language} onValueChange={setLanguage}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{SARVAM_TTS_LANGUAGES.filter((l) => l.code !== "en").map((lang) => (
										<SelectItem key={lang.code} value={lang.code}>
											{lang.name}
										</SelectItem>
									))}
									<SelectItem value="en">Inglês (indiano)</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Sarvam: Speaker */}
						<div className="flex flex-col gap-2">
							<Label className="text-xs">Locutor</Label>
							<Select value={sarvamSpeaker} onValueChange={setSarvamSpeaker}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{SARVAM_TTS_SPEAKERS.map((s) => (
										<SelectItem key={s.id} value={s.id}>
											{s.name} ({s.gender})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{needsTranslation && (
							<div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5">
								<p className="text-[10px] text-blue-400 leading-relaxed">
									A transcrição será traduzida automaticamente para {ALL_TTS_LANGUAGES.find((l) => l.code === language)?.name || language} via Sarvam antes de gerar a fala.
								</p>
							</div>
						)}
					</>
				) : engine === "smallest" ? (
					<>
						{/* Smallest: Language */}
						<div className="flex flex-col gap-2">
							<Label className="text-xs">Idioma</Label>
							<Select value={language} onValueChange={(val) => {
								setLanguage(val);
								const voicesForLang = getSmallestVoicesForLanguage(val);
								if (voicesForLang.length > 0) {
									if (!voicesForLang.some((v) => v.id === smallestVoice)) {
										setSmallestVoice(voicesForLang[0].id);
									}
								} else {
									// No dedicated voices for this language — fall back to English default
									const enVoices = getSmallestVoicesForLanguage("en");
									if (!enVoices.some((v) => v.id === smallestVoice)) {
										setSmallestVoice(enVoices[0]?.id ?? "emily");
									}
								}
							}}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{SMALLEST_TTS_LANGUAGES.map((lang) => (
										<SelectItem key={lang.code} value={lang.code}>
											{lang.name}
											{lang.status === "beta" && " (Beta)"}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Smallest: Voice */}
						<div className="flex flex-col gap-2">
							<Label className="text-xs">Voz</Label>
							<Select value={smallestVoice} onValueChange={setSmallestVoice}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{(smallestVoicesForLang.length > 0 ? smallestVoicesForLang : SMALLEST_TTS_VOICES.filter((v) => v.language === "en")).map((v) => (
										<SelectItem key={v.id} value={v.id}>
											{v.name} ({v.gender})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Smallest: Speed */}
						<div className="flex flex-col gap-2">
							<Label className="text-xs">Velocidade ({smallestSpeed.toFixed(1)}x)</Label>
							<input
								type="range"
								min={0.5}
								max={2.0}
								step={0.1}
								value={smallestSpeed}
								onChange={(e) => setSmallestSpeed(parseFloat(e.target.value))}
								className="w-full accent-primary"
							/>
							<div className="flex justify-between text-[9px] text-muted-foreground">
								<span>0.5x</span>
								<span>1.0x</span>
								<span>2.0x</span>
							</div>
						</div>

						{needsTranslation && (
							<div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5">
								<p className="text-[10px] text-blue-400 leading-relaxed">
									A transcrição será traduzida automaticamente para {ALL_TTS_LANGUAGES.find((l) => l.code === language)?.name || language} antes de gerar a fala.
								</p>
							</div>
						)}
					</>
				) : (
					<>
						{/* Local: Language */}
						<div className="flex flex-col gap-2">
							<Label className="text-xs">Idioma</Label>
							<Select value={language} onValueChange={setLanguage}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{COQUI_LANGUAGES.map((lang) => (
										<SelectItem key={lang.code} value={lang.code}>
											{lang.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{needsTranslation && (
								<div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5">
									<p className="text-[10px] text-blue-400 leading-relaxed">
										A transcrição será traduzida automaticamente para {COQUI_LANGUAGES.find((l) => l.code === language)?.name || language} antes de gerar a fala.
									</p>
								</div>
							)}
						</div>

						{/* Local: Voice type */}
						<div className="flex flex-col gap-2">
							<Label className="text-xs">Tipo de voz</Label>
							<div className="flex gap-1.5">
								<button
									type="button"
									className={cn(
										"flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
										voiceGender === "male"
											? "bg-primary text-primary-foreground border-primary"
											: "text-muted-foreground hover:bg-accent border-border",
									)}
									onClick={() => setVoiceGender("male")}
								>
									Masculina
								</button>
								<button
									type="button"
									className={cn(
										"flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
										voiceGender === "female"
											? "bg-primary text-primary-foreground border-primary"
											: "text-muted-foreground hover:bg-accent border-border",
									)}
									onClick={() => setVoiceGender("female")}
								>
									Feminina
								</button>
							</div>
							{clonedVoiceName && (
								<p className="text-[9px] text-muted-foreground">
									O tipo de voz é substituído pela voz clonada abaixo.
								</p>
							)}
						</div>

						{/* Local: Voice cloning */}
						<div className="flex flex-col gap-2">
							<Label className="text-xs">Clonagem de voz (opcional)</Label>
							{clonedVoiceName ? (
								<div className="flex items-center justify-between rounded-md bg-green-500/10 border border-green-500/20 px-2.5 py-2">
									<div className="flex items-center gap-2">
										<span className="size-1.5 rounded-full bg-green-500" />
										<span className="text-[11px] font-medium">Clonada: {clonedVoiceName}</span>
									</div>
									<button
										type="button"
										className="text-[10px] text-destructive hover:text-destructive/80"
										onClick={() => { setClonedVoicePath(null); setClonedVoiceName(null); }}
									>
										Remover
									</button>
								</div>
							) : (
								<div className="flex flex-col gap-1.5">
									<div className="flex gap-1.5">
										<Button
											variant="outline"
											size="sm"
											className="flex-1 text-[10px] h-7"
											disabled={isUploading}
											onClick={() => fileInputRef.current?.click()}
										>
											{isUploading ? <><Spinner className="size-3 mr-1" />Enviando...</> : "Enviar amostra de voz"}
										</Button>
										<Badge variant="secondary" className="text-[9px] px-1.5 py-0 self-center">
											ou use a voz padrão
										</Badge>
									</div>
									<p className="text-[9px] text-muted-foreground">
										Envie um áudio de 10 a 30s para clonar uma voz específica.
									</p>
									<input
										ref={fileInputRef}
										type="file"
										accept=".wav,.mp3,.flac,.ogg,.m4a"
										className="hidden"
										onChange={(e) => {
											const file = e.target.files?.[0];
											if (file) handleUploadVoice(file);
											e.target.value = "";
										}}
									/>
								</div>
							)}
						</div>

						{/* Local: Model */}
						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">Modelo</Label>
							<Select value={selectedModel} onValueChange={setSelectedModel}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{TTS_MODELS.map((model) => (
										<SelectItem key={model.id} value={model.id}>
											<div className="flex items-center gap-2">
												<span>{model.name}</span>
												{model.installed && <Badge variant="secondary" className="text-[8px] px-1 py-0">Instalado</Badge>}
												{!model.installed && <Badge variant="outline" className="text-[8px] px-1 py-0">Não instalado</Badge>}
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<div className="flex items-center gap-1.5 flex-wrap">
								<Badge variant="secondary" className="text-[9px] px-1 py-0">{currentModel.quality}</Badge>
								<Badge variant="secondary" className="text-[9px] px-1 py-0">{currentModel.speed}</Badge>
								<Badge variant="secondary" className="text-[9px] px-1 py-0">{currentModel.size}</Badge>
								{currentModel.supportsCloning && (
									<Badge variant="outline" className="text-[9px] px-1 py-0 text-green-500 border-green-500/30">Clonagem</Badge>
								)}
							</div>
						</div>
					</>
				)}

				{/* ── Errors & progress ── */}
				{error && (
					<div className="bg-destructive/10 border-destructive/20 rounded-md border p-2.5">
						<p className="text-destructive text-[11px]">{error}</p>
					</div>
				)}

				{generationProgress && (
					<div className="flex items-center gap-2 text-[11px] text-muted-foreground">
						<Spinner className="size-3" />
						{generationProgress}
					</div>
				)}

				{/* ── Generate buttons ── */}
				<div className="flex flex-col gap-1.5">
					{hasTranscript && useTranscript && (
						<Button
							className="w-full"
							onClick={handleGeneratePerSegment}
							disabled={isGenerating || !canGenerate}
						>
							{isGenerating && <Spinner className="mr-1" />}
							Gerar por segmento
						</Button>
					)}

					<Button
						variant={hasTranscript && useTranscript ? "outline" : "default"}
						className="w-full"
						onClick={handleGenerate}
						disabled={isGenerating || !textToGenerate || !canGenerate}
					>
						{isGenerating && !generationProgress.includes("segment") && <Spinner className="mr-1" />}
						Gerar narração completa
					</Button>

					{engine === "local" && !currentModel.installed && (
						<p className="text-[10px] text-yellow-500 text-center">
							Este modelo não está instalado. Use o Coqui XTTS v2 (instalado) ou instale este modelo no backend.
						</p>
					)}
				</div>

				{/* ── Audio preview ── */}
				{generatedAudioUrl && (
					<div className="flex flex-col gap-2 rounded-md border p-2.5 bg-muted/30">
						<p className="text-[10px] text-muted-foreground font-medium">Pré-visualização</p>
						<audio
							ref={audioRef}
							src={generatedAudioUrl}
							controls
							className="w-full h-8"
						/>
						<Button
							variant="outline"
							size="sm"
							className="w-full h-auto min-h-8 py-1.5 whitespace-normal text-[11px] leading-tight"
							onClick={handleAddToTimeline}
						>
							Adicionar à linha do tempo como faixa de voz
						</Button>
					</div>
				)}
			</div>
		</PanelView>
	);
}

function getAudioDuration(url: string): Promise<number> {
	return new Promise((resolve) => {
		const audio = new Audio(url);
		audio.addEventListener("loadedmetadata", () => {
			resolve(audio.duration);
		});
		audio.addEventListener("error", () => {
			resolve(5);
		});
	});
}
