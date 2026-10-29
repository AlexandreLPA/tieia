"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	bestVariation,
	CHATTERBOX_CONTROLS,
	CHATTERBOX_LANGUAGES,
	describePace,
	describeSimilarity,
	type TakeVerdict,
} from "@/lib/voiceover/chatterbox";
import {
	DEFAULT_VOICE_TUNING,
	isDefaultTuning,
	type VoiceTuning,
	voiceLabel,
} from "@/lib/voiceover/voice-preferences";
import { cn } from "@/utils/ui";

export type ChatterboxSettings = VoiceTuning;
export const DEFAULT_CHATTERBOX_SETTINGS = DEFAULT_VOICE_TUNING;

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
	/** The voice the tuning is saved for; null with the default voice */
	voiceName: string | null;
	lastTake: ChatterboxTakeMetrics | null;
}

const CONTROLS = [
	{
		key: "exaggeration",
		label: "Emoção",
		hint: "Mais alta: mais expressiva e um pouco mais rápida.",
	},
	{
		key: "cfgWeight",
		label: "Ritmo",
		hint: "Mais baixo: fala mais lenta e solta. Com emoção alta, deixe em ~0,3.",
	},
	{
		key: "temperature",
		label: "Variação",
		hint: "Mais alta: a entonação muda mais de uma tentativa para outra.",
	},
] as const;

/** The Chatterbox engine's part of the Voiceover panel: language, and the tuning tucked away until needed. */
export function ChatterboxVoice({
	language,
	onLanguageChange,
	needsTranslation,
	settings,
	onSettingsChange,
	voiceName,
	lastTake,
}: ChatterboxVoiceProps) {
	const tuned = !isDefaultTuning(settings);

	return (
		<>
			<div className="flex flex-col gap-2">
				<Label className="text-xs">Idioma da fala</Label>
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

			<Collapsible className="rounded-md border">
				<CollapsibleTrigger className="group flex w-full items-center justify-between px-2.5 py-2 text-left">
					<span className="flex flex-col">
						<span className="text-xs font-medium">Ajustar a voz</span>
						<span className="text-[10px] text-muted-foreground">
							{tuned
								? voiceName
									? `Ajustes salvos para ${voiceLabel(voiceName)}`
									: "Ajustes personalizados"
								: "Emoção, ritmo e variação"}
						</span>
					</span>
					<HugeiconsIcon
						icon={ArrowDown01Icon}
						className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
					/>
				</CollapsibleTrigger>
				<CollapsibleContent className="flex flex-col gap-3 border-t px-2.5 py-2.5">
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
										label="Semelhança"
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

					{tuned && (
						<button
							type="button"
							className="self-start text-[10px] text-muted-foreground hover:text-foreground hover:underline"
							onClick={() => onSettingsChange(DEFAULT_VOICE_TUNING)}
						>
							Restaurar o padrão
						</button>
					)}
				</CollapsibleContent>
			</Collapsible>
		</>
	);
}

export interface ChatterboxVariation extends ChatterboxTakeMetrics {
	blob: Blob;
	url: string;
}

interface ChatterboxVariationsProps {
	variations: ChatterboxVariation[];
	/** The one in the preview, the one that goes to the timeline. */
	chosen: number | null;
	onChoose: (index: number) => void;
}

/** Takes of the same text side by side: listen to each, keep the best. */
export function ChatterboxVariations({
	variations,
	chosen,
	onChoose,
}: ChatterboxVariationsProps) {
	const [playing, setPlaying] = useState<number | null>(null);
	const playerRef = useRef<HTMLAudioElement | null>(null);
	const best = bestVariation(variations);

	useEffect(() => () => playerRef.current?.pause(), []);

	const toggle = (index: number) => {
		playerRef.current?.pause();
		if (playing === index) {
			setPlaying(null);
			return;
		}
		const player = new Audio(variations[index].url);
		player.addEventListener("ended", () => setPlaying(null));
		playerRef.current = player;
		setPlaying(index);
		void player.play();
	};

	return (
		<div className="flex flex-col gap-1.5 rounded-md border bg-muted/30 p-2.5">
			<p className="text-[10px] text-muted-foreground font-medium">
				Variações: ouça e escolha a melhor
			</p>
			{variations.map((take, index) => (
				<div
					key={take.url}
					className={cn(
						"flex flex-col gap-1 rounded-md border px-2 py-1.5",
						chosen === index ? "border-primary bg-primary/5" : "border-border",
					)}
				>
					<div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
						<span className="text-[11px] font-medium whitespace-nowrap">
							Variação {index + 1}
							{best === index && (
								<span className="ml-1.5 text-[9px] font-normal text-green-500">
									sugerida
								</span>
							)}
						</span>
						<div className="flex items-center gap-2 whitespace-nowrap">
							<button
								type="button"
								className="text-[10px] text-primary hover:underline"
								onClick={() => toggle(index)}
							>
								{playing === index ? "Parar" : "Ouvir"}
							</button>
							{chosen === index ? (
								<span className="text-[10px] text-muted-foreground">
									Escolhida
								</span>
							) : (
								<button
									type="button"
									className="text-[10px] text-primary hover:underline"
									onClick={() => onChoose(index)}
								>
									Usar esta
								</button>
							)}
						</div>
					</div>
					{take.similarity !== null && (
						<Verdict
							label="Semelhança"
							verdict={describeSimilarity(take.similarity)}
						/>
					)}
					{take.wordsPerMinute !== null && take.wordsPerMinute > 0 && (
						<Verdict
							label="Ritmo"
							verdict={describePace(take.wordsPerMinute)}
						/>
					)}
				</div>
			))}
		</div>
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
