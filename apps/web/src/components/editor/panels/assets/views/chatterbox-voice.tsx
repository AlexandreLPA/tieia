"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { ReferenceAnalysis } from "@/types/ai";
import {
	CHATTERBOX_CONTROLS,
	CHATTERBOX_LANGUAGES,
	describePace,
	describeSimilarity,
	type TakeVerdict,
} from "@/lib/voiceover/chatterbox";
import { cn } from "@/utils/ui";

export interface ChatterboxSettings {
	exaggeration: number;
	cfgWeight: number;
	temperature: number;
	/** 0 picks a random seed for each take. */
	seed: number;
}

export const DEFAULT_CHATTERBOX_SETTINGS: ChatterboxSettings = {
	exaggeration: CHATTERBOX_CONTROLS.exaggeration.default,
	cfgWeight: CHATTERBOX_CONTROLS.cfgWeight.default,
	temperature: CHATTERBOX_CONTROLS.temperature.default,
	seed: 0,
};

export interface ChatterboxTakeMetrics {
	similarity: number | null;
	wordsPerMinute: number | null;
	seed: number | null;
}

interface ChatterboxVoiceProps {
	language: string;
	onLanguageChange: (language: string) => void;
	needsTranslation: boolean;
	settings: ChatterboxSettings;
	onSettingsChange: (settings: ChatterboxSettings) => void;
	voiceName: string | null;
	isUploading: boolean;
	onUploadVoice: (file: File) => void;
	onRemoveVoice: () => void;
	analysis: ReferenceAnalysis | null;
	isAnalyzing: boolean;
	lastTake: ChatterboxTakeMetrics | null;
}

const CONTROLS = [
	{
		key: "exaggeration",
		label: "Exagero (emoção)",
		hint: "Mais alto: mais expressiva e mais rápida.",
	},
	{
		key: "cfgWeight",
		label: "cfg (ritmo)",
		hint: "Mais baixo: mais lenta e solta. Com exagero alto, baixe para ~0,3.",
	},
	{
		key: "temperature",
		label: "Temperatura (variação)",
		hint: "Mais alta: entonação muda mais de uma tentativa para outra.",
	},
] as const;

const STATUS_DOT = {
	ok: "bg-green-500",
	warn: "bg-yellow-500",
	info: "bg-blue-500",
} as const;

/** The Chatterbox engine's part of the Voiceover panel: reference, controls, and the last take's reading. */
export function ChatterboxVoice({
	language,
	onLanguageChange,
	needsTranslation,
	settings,
	onSettingsChange,
	voiceName,
	isUploading,
	onUploadVoice,
	onRemoveVoice,
	analysis,
	isAnalyzing,
	lastTake,
}: ChatterboxVoiceProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);

	return (
		<>
			<div className="flex flex-col gap-2">
				<Label className="text-xs">Idioma</Label>
				<Select value={language} onValueChange={onLanguageChange}>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{CHATTERBOX_LANGUAGES.map((lang) => (
							<SelectItem key={lang.code} value={lang.code}>
								{lang.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{needsTranslation && (
					<div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5">
						<p className="text-[10px] text-blue-400 leading-relaxed">
							A transcrição será traduzida automaticamente para{" "}
							{CHATTERBOX_LANGUAGES.find((l) => l.code === language)?.name ??
								language}{" "}
							antes de gerar a fala.
						</p>
					</div>
				)}
			</div>

			{/* Reference */}
			<div className="flex flex-col gap-2">
				<Label className="text-xs">Voz de referência</Label>
				{voiceName ? (
					<div className="flex items-center justify-between rounded-md bg-green-500/10 border border-green-500/20 px-2.5 py-2">
						<div className="flex items-center gap-2 min-w-0">
							<span className="size-1.5 shrink-0 rounded-full bg-green-500" />
							<span className="text-[11px] font-medium truncate">
								Clonada: {voiceName}
							</span>
						</div>
						<button
							type="button"
							className="text-[10px] text-destructive hover:text-destructive/80"
							onClick={onRemoveVoice}
						>
							Remover
						</button>
					</div>
				) : (
					<div className="flex flex-col gap-1.5">
						<Button
							variant="outline"
							size="sm"
							className="text-[10px] h-7"
							disabled={isUploading}
							onClick={() => fileInputRef.current?.click()}
						>
							{isUploading ? (
								<>
									<Spinner className="size-3 mr-1" />
									Enviando...
								</>
							) : (
								"Enviar gravação de referência"
							)}
						</Button>
						<p className="text-[9px] text-muted-foreground">
							10 a 15 s de fala contínua, só da pessoa, num cômodo quieto. Use
							só vozes de quem autorizou. Sem referência, sai a voz padrão do
							Chatterbox.
						</p>
						<input
							ref={fileInputRef}
							type="file"
							accept=".wav,.mp3,.flac,.ogg,.m4a"
							className="hidden"
							onChange={(e) => {
								const file = e.target.files?.[0];
								if (file) onUploadVoice(file);
								e.target.value = "";
							}}
						/>
					</div>
				)}

				{isAnalyzing && (
					<div className="flex items-center gap-2 text-[10px] text-muted-foreground">
						<Spinner className="size-3" />
						Analisando a gravação...
					</div>
				)}
				{analysis && voiceName && (
					<div className="flex flex-col gap-1 rounded-md border bg-muted/30 px-2.5 py-2">
						<p className="text-[10px] text-muted-foreground">
							{analysis.duration.toFixed(1)} s
							{analysis.lufs !== null && ` · ${analysis.lufs.toFixed(0)} LUFS`}
							{analysis.noise_db !== null &&
								` · fundo ${analysis.noise_db.toFixed(0)} dB`}
						</p>
						{analysis.checks.map((check) => (
							<div key={check.id} className="flex items-start gap-1.5">
								<span
									className={cn(
										"mt-1 size-1.5 shrink-0 rounded-full",
										STATUS_DOT[check.status],
									)}
								/>
								<span className="text-[10px] leading-relaxed">
									{check.advice}
								</span>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Controls */}
			{CONTROLS.map(({ key, label, hint }) => {
				const range = CHATTERBOX_CONTROLS[key];
				return (
					<div key={key} className="flex flex-col gap-1.5">
						<div className="flex items-center justify-between">
							<Label className="text-xs">{label}</Label>
							<span className="text-[10px] tabular-nums text-muted-foreground">
								{settings[key].toFixed(2)}
							</span>
						</div>
						<input
							type="range"
							min={range.min}
							max={range.max}
							step={range.step}
							value={settings[key]}
							onChange={(e) =>
								onSettingsChange({
									...settings,
									[key]: Number.parseFloat(e.target.value),
								})
							}
							onDoubleClick={() =>
								onSettingsChange({ ...settings, [key]: range.default })
							}
							className="w-full accent-primary"
						/>
						<p className="text-[9px] text-muted-foreground">{hint}</p>
					</div>
				);
			})}

			<div className="flex flex-col gap-1.5">
				<Label className="text-xs">Semente</Label>
				<div className="flex items-center gap-1.5">
					<input
						type="number"
						min={0}
						step={1}
						value={settings.seed}
						onChange={(e) => {
							const seed = Math.max(0, Math.floor(Number(e.target.value) || 0));
							onSettingsChange({ ...settings, seed });
						}}
						className="h-7 w-28 rounded-md border bg-transparent px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
					/>
					<span className="text-[9px] text-muted-foreground">
						{settings.seed === 0
							? "0 = aleatória"
							: "mesmos ajustes, mesmo áudio"}
					</span>
				</div>
			</div>

			{lastTake &&
				(lastTake.similarity !== null || lastTake.wordsPerMinute !== null) && (
					<div className="flex flex-col gap-1 rounded-md border bg-muted/30 px-2.5 py-2">
						<p className="text-[10px] text-muted-foreground font-medium">
							Última tentativa
						</p>
						{lastTake.similarity !== null && (
							<Verdict
								label="Similaridade"
								verdict={describeSimilarity(lastTake.similarity)}
							/>
						)}
						{lastTake.wordsPerMinute !== null &&
							lastTake.wordsPerMinute > 0 && (
								<Verdict
									label="Ritmo"
									verdict={describePace(lastTake.wordsPerMinute)}
								/>
							)}
						{lastTake.seed !== null && (
							<div className="flex items-center justify-between gap-2">
								<span className="text-[10px] text-muted-foreground">
									Semente usada: {lastTake.seed}
								</span>
								{settings.seed !== lastTake.seed && (
									<button
										type="button"
										className="text-[10px] text-primary hover:underline"
										onClick={() =>
											onSettingsChange({
												...settings,
												seed: lastTake.seed ?? 0,
											})
										}
									>
										Fixar
									</button>
								)}
							</div>
						)}
					</div>
				)}
		</>
	);
}

function Verdict({ label, verdict }: { label: string; verdict: TakeVerdict }) {
	return (
		<div className="flex items-start gap-1.5">
			<span
				className={cn(
					"mt-1 size-1.5 shrink-0 rounded-full",
					verdict.ok ? "bg-green-500" : "bg-yellow-500",
				)}
			/>
			<span className="text-[10px] leading-relaxed">
				<span className="font-medium">{label}:</span> {verdict.text}
			</span>
		</div>
	);
}
