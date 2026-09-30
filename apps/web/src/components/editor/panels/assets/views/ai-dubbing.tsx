"use client";

import { useCallback, useState } from "react";
import { useEditor } from "@/hooks/use-editor";
import { useTranscriptStore } from "@/stores/transcript-store";
import { useAIDubbing, type DubbingEngine } from "@/hooks/use-ai-dubbing";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/ui";
import { SARVAM_TTS_LANGUAGES, SARVAM_TTS_SPEAKERS } from "@/constants/sarvam-constants";
import { toast } from "sonner";

const DUBBING_LANGUAGES = [
	{ code: "hi", name: "Hindi" },
	{ code: "bn", name: "Bengali" },
	{ code: "ta", name: "Tâmil" },
	{ code: "te", name: "Telugo" },
	{ code: "mr", name: "Marata" },
	{ code: "gu", name: "Guzerate" },
	{ code: "kn", name: "Canarês" },
	{ code: "ml", name: "Malaiala" },
	{ code: "pa", name: "Panjabi" },
	{ code: "od", name: "Odia" },
	{ code: "en", name: "Inglês" },
	{ code: "es", name: "Espanhol" },
	{ code: "fr", name: "Francês" },
	{ code: "de", name: "Alemão" },
	{ code: "pt", name: "Português" },
	{ code: "ja", name: "Japonês" },
	{ code: "ko", name: "Coreano" },
	{ code: "zh", name: "Chinês" },
	{ code: "ar", name: "Árabe" },
	{ code: "ru", name: "Russo" },
	{ code: "it", name: "Italiano" },
];

const ENGINES: Array<{
	value: DubbingEngine;
	label: string;
	description: string;
}> = [
	{
		value: "sarvam",
		label: "Sarvam AI",
		description: "11 idiomas indianos, 23 vozes",
	},
	{
		value: "smallest",
		label: "Smallest AI",
		description: "15 idiomas, mais de 80 vozes, baixa latência",
	},
	{
		value: "local",
		label: "Local NLLB + XTTS",
		description: "100% privado — sem nuvem, sem chave de API",
	},
];

export function AIDubbingPanel() {
	const segments = useTranscriptStore((s) => s.segments);
	const language = useTranscriptStore((s) => s.language);
	const editor = useEditor();
	const { runDubbing, isDubbing, progress } = useAIDubbing();

	const [targetLanguage, setTargetLanguage] = useState("hi");
	const [engine, setEngine] = useState<DubbingEngine>("sarvam");
	const [voiceId, setVoiceId] = useState("shubh");

	const isSarvamLang = SARVAM_TTS_LANGUAGES.some(
		(l) => l.code === targetLanguage,
	);

	const handleDub = useCallback(() => {
		if (segments.length === 0) {
			toast.error("Nenhuma transcrição disponível. Transcreva primeiro.");
			return;
		}
		if (language === targetLanguage) {
			toast.error("O idioma de destino é igual ao de origem.");
			return;
		}
		runDubbing({
			targetLanguage,
			engine,
			voiceId,
		});
	}, [segments, language, targetLanguage, engine, voiceId, runDubbing]);

	const voiceOptions =
		engine === "sarvam"
			? SARVAM_TTS_SPEAKERS.map((s) => ({ id: s.id, name: s.name }))
			: engine === "smallest"
				? [
						{ id: "emily", name: "Emily" },
						{ id: "jasper", name: "Jasper" },
						{ id: "matthew", name: "Matthew" },
						{ id: "maitrayi", name: "Maitrayi" },
					]
				: [{ id: "default", name: "Padrão" }];

	return (
		<div className="flex flex-col gap-4 p-3">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<span className="text-xs font-medium">Dublagem por IA</span>
					{segments.length > 0 && (
						<Badge variant="secondary" className="text-[8px] px-1 py-0">
							{segments.length} segmentos
						</Badge>
					)}
				</div>
				<Badge variant="outline" className="text-[8px] px-1 py-0">
					Origem: {language}
				</Badge>
			</div>

			<p className="text-[10px] text-muted-foreground leading-relaxed">
				Traduz os segmentos da transcrição e gera fala no idioma de destino.
				Cada segmento dublado é posicionado como uma nova faixa de áudio
				alinhada aos tempos originais.
			</p>

			{engine === "local" && (
				<div className="flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1">
					<svg
						className="size-3 text-emerald-600 shrink-0"
						viewBox="0 0 16 16"
						fill="none"
					>
						<path
							d="M8 1.5L2 4v4c0 3.5 2.5 6.5 6 7.5 3.5-1 6-4 6-7.5V4L8 1.5z"
							stroke="currentColor"
							strokeWidth="1.2"
							strokeLinejoin="round"
						/>
					</svg>
					<span className="text-[9px] text-emerald-700 dark:text-emerald-400 font-medium">
						Totalmente local — tradução via NLLB-200, nunca sai da sua máquina
					</span>
				</div>
			)}

			<div className="flex flex-col gap-1.5">
				<Label className="text-[10px]">Idioma de destino</Label>
				<Select value={targetLanguage} onValueChange={setTargetLanguage}>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{DUBBING_LANGUAGES.map((lang) => (
							<SelectItem key={lang.code} value={lang.code}>
								{lang.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label className="text-[10px]">Motor de TTS</Label>
				<div className="flex flex-col gap-1">
					{ENGINES.map((e) => {
						const isActive = engine === e.value;
						const isDisabled =
							e.value === "sarvam" && !isSarvamLang && targetLanguage !== "en";
						return (
							<button
								key={e.value}
								type="button"
								disabled={isDisabled}
								onClick={() => setEngine(e.value)}
								className={cn(
									"flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left transition-colors",
									isActive
										? "border-primary/40 bg-primary/5"
										: isDisabled
											? "opacity-50 cursor-not-allowed"
											: "border-border hover:bg-accent cursor-pointer",
								)}
							>
								<div className="flex items-center gap-1.5">
									{isActive ? (
										<svg
											className="size-3 text-primary shrink-0"
											viewBox="0 0 16 16"
											fill="none"
										>
											<path
												d="M3 8.5L6.5 12L13 4"
												stroke="currentColor"
												strokeWidth="2"
												strokeLinecap="round"
												strokeLinejoin="round"
											/>
										</svg>
									) : (
										<span className="size-3 shrink-0" />
									)}
									<span className="text-[10px] font-medium">{e.label}</span>
								</div>
								<span className="text-[9px] text-muted-foreground">
									{e.description}
								</span>
							</button>
						);
					})}
				</div>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label className="text-[10px]">Voz</Label>
				<Select value={voiceId} onValueChange={setVoiceId}>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{voiceOptions.map((v) => (
							<SelectItem key={v.id} value={v.id}>
								{v.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{progress && (
				<div className="flex flex-col gap-1 rounded-md border border-primary/20 bg-primary/5 p-2">
					<div className="flex items-center justify-between">
						<span className="text-[9px] font-medium">
							{progress.phase === "translating"
								? "Traduzindo..."
								: progress.phase === "generating"
									? "Gerando fala..."
									: progress.phase === "placing"
										? "Posicionando na linha do tempo..."
										: "Concluído"}
						</span>
						<span className="text-[9px] text-muted-foreground">
							{progress.currentSegment}/{progress.totalSegments}
						</span>
					</div>
					<div className="w-full bg-muted rounded-full h-1">
						<div
							className="bg-primary h-1 rounded-full transition-all"
							style={{
								width: `${(progress.currentSegment / progress.totalSegments) * 100}%`,
							}}
						/>
					</div>
					<span className="text-[8px] text-muted-foreground truncate">
						{progress.currentText}
					</span>
				</div>
			)}

			<button
				type="button"
				disabled={isDubbing || segments.length === 0}
				onClick={handleDub}
				className={cn(
					"w-full rounded-md py-2 text-xs font-medium transition-colors",
					isDubbing
						? "bg-muted text-muted-foreground cursor-not-allowed"
						: "bg-primary text-primary-foreground hover:bg-primary/90",
				)}
			>
				{isDubbing ? "Dublando..." : "Iniciar dublagem"}
			</button>
		</div>
	);
}
