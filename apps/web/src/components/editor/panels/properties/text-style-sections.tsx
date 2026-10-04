"use client";

import type {
	TextElement,
	TextGradient,
	TextHighlightStyle,
	TextLetterStyle,
	TextShadow,
	TextStroke,
} from "@/types/timeline";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "./section";
import { ColorPicker } from "@/components/ui/color-picker";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useEditor } from "@/hooks/use-editor";
import {
	DEFAULT_TEXT_SHADOW,
	DEFAULT_TEXT_STROKE,
} from "@/constants/text-constants";
import { uppercase } from "@/utils/string";
import { cn } from "@/utils/ui";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";

type TextUpdates = Partial<
	Pick<
		TextElement,
		| "stroke"
		| "shadow"
		| "highlightStyle"
		| "highlightColor"
		| "wordPopScale"
		| "letterStyle"
		| "letterSeed"
		| "fillGradient"
	>
>;

function useTextUpdater({
	element,
	trackId,
}: {
	element: TextElement;
	trackId: string;
}) {
	const editor = useEditor();
	const target = { trackId, elementId: element.id };
	return {
		set: (updates: TextUpdates) =>
			editor.timeline.updateElements({ updates: [{ ...target, updates }] }),
		// Live while dragging; one undo step when released
		preview: (updates: TextUpdates) =>
			editor.timeline.previewElements({ updates: [{ ...target, updates }] }),
		commit: () => editor.timeline.commitPreview(),
	};
}

// Color pickers here take plain RRGGBB; alpha (e.g. a soft shadow) is dropped
function toPickerValue(color: string): string {
	return uppercase({ string: color.replace("#", "").slice(0, 6) });
}

function VisibilityToggle({
	enabled,
	onToggle,
	label,
}: {
	enabled: boolean;
	onToggle: () => void;
	label: string;
}) {
	return (
		<Button
			variant="ghost"
			size="icon"
			aria-label={label}
			aria-pressed={enabled}
			onClick={(event) => {
				event.stopPropagation();
				onToggle();
			}}
		>
			<HugeiconsIcon icon={enabled ? ViewIcon : ViewOffSlashIcon} />
		</Button>
	);
}

function SliderField({
	label,
	value,
	min,
	max,
	step,
	format,
	onPreview,
	onCommit,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	format: (value: number) => string;
	onPreview: (value: number) => void;
	onCommit: () => void;
}) {
	return (
		<SectionField label={label}>
			<div className="flex items-center gap-2">
				<Slider
					value={[value]}
					min={min}
					max={max}
					step={step}
					onValueChange={([next]) => onPreview(next)}
					onValueCommit={onCommit}
					aria-label={label}
				/>
				<span className="text-muted-foreground w-10 shrink-0 text-right text-[10px] tabular-nums">
					{format(value)}
				</span>
			</div>
		</SectionField>
	);
}

export function StrokeSection({
	element,
	trackId,
}: {
	element: TextElement;
	trackId: string;
}) {
	const { set, preview, commit } = useTextUpdater({ element, trackId });
	const stroke: TextStroke = element.stroke ?? DEFAULT_TEXT_STROKE;

	return (
		<Section collapsible defaultOpen={stroke.enabled} sectionKey="text:stroke">
			<SectionHeader
				trailing={
					<VisibilityToggle
						enabled={stroke.enabled}
						label={stroke.enabled ? "Desligar contorno" : "Ligar contorno"}
						onToggle={() => set({ stroke: { ...stroke, enabled: !stroke.enabled } })}
					/>
				}
			>
				<SectionTitle>Contorno</SectionTitle>
			</SectionHeader>
			<SectionContent
				className={cn(!stroke.enabled && "pointer-events-none opacity-50")}
			>
				<SectionFields>
					<SectionField label="Cor">
						<ColorPicker
							value={toPickerValue(stroke.color)}
							onChange={(color) =>
								preview({ stroke: { ...stroke, color: `#${color}` } })
							}
							onChangeEnd={commit}
						/>
					</SectionField>
					<SliderField
						label="Espessura"
						value={stroke.width}
						min={1}
						max={30}
						step={1}
						format={(value) => `${value}`}
						onPreview={(width) => preview({ stroke: { ...stroke, width } })}
						onCommit={commit}
					/>
				</SectionFields>
			</SectionContent>
		</Section>
	);
}

export function ShadowSection({
	element,
	trackId,
}: {
	element: TextElement;
	trackId: string;
}) {
	const { set, preview, commit } = useTextUpdater({ element, trackId });
	const shadow: TextShadow = element.shadow ?? DEFAULT_TEXT_SHADOW;

	return (
		<Section collapsible defaultOpen={shadow.enabled} sectionKey="text:shadow">
			<SectionHeader
				trailing={
					<VisibilityToggle
						enabled={shadow.enabled}
						label={shadow.enabled ? "Desligar sombra" : "Ligar sombra"}
						onToggle={() => set({ shadow: { ...shadow, enabled: !shadow.enabled } })}
					/>
				}
			>
				<SectionTitle>Sombra</SectionTitle>
			</SectionHeader>
			<SectionContent
				className={cn(!shadow.enabled && "pointer-events-none opacity-50")}
			>
				<SectionFields>
					<SectionField label="Cor">
						<ColorPicker
							value={toPickerValue(shadow.color)}
							onChange={(color) =>
								preview({ shadow: { ...shadow, color: `#${color}` } })
							}
							onChangeEnd={commit}
						/>
					</SectionField>
					<SliderField
						label="Desfoque"
						value={shadow.blur}
						min={0}
						max={40}
						step={1}
						format={(value) => `${value}`}
						onPreview={(blur) => preview({ shadow: { ...shadow, blur } })}
						onCommit={commit}
					/>
					<SliderField
						label="Distância"
						value={shadow.offsetY}
						min={0}
						max={20}
						step={1}
						format={(value) => `${value}`}
						onPreview={(offsetY) => preview({ shadow: { ...shadow, offsetY } })}
						onCommit={commit}
					/>
				</SectionFields>
			</SectionContent>
		</Section>
	);
}

const HIGHLIGHT_STYLES: { value: TextHighlightStyle; label: string }[] = [
	{ value: "word", label: "Palavra atual" },
	{ value: "box", label: "Caixa" },
	{ value: "progressive", label: "Acumulado" },
	{ value: "none", label: "Nenhum" },
];

/** Only for texts with word timings (captions): how the spoken word shows. */
export function HighlightSection({
	element,
	trackId,
}: {
	element: TextElement;
	trackId: string;
}) {
	const editor = useEditor();
	const { set, preview, commit } = useTextUpdater({ element, trackId });
	if (!element.wordTimings || element.wordTimings.length === 0) return null;

	const style = element.highlightStyle ?? "progressive";
	const color = element.highlightColor ?? "#FACC15";
	const pop = element.wordPopScale ?? 1;

	// Captions are one text per phrase; restyling them one by one is tedious
	const applyToTrack = () => {
		const track = editor.timeline.getTracks().find((t) => t.id === trackId);
		if (!track) return;
		const updates = track.elements
			.filter((other) => other.type === "text" && other.id !== element.id)
			.map((other) => ({
				trackId,
				elementId: other.id,
				updates: {
					color: element.color,
					fontFamily: element.fontFamily,
					fontSize: element.fontSize,
					fontWeight: element.fontWeight,
					background: element.background,
					stroke: element.stroke,
					shadow: element.shadow,
					highlightStyle: element.highlightStyle,
					highlightColor: element.highlightColor,
					wordPopScale: element.wordPopScale,
				},
			}));
		if (updates.length === 0) return;
		editor.timeline.updateElements({ updates });
		toast.success(`Estilo aplicado a mais ${updates.length} legendas da faixa`);
	};

	return (
		<Section collapsible sectionKey="text:highlight">
			<SectionHeader>
				<SectionTitle>Destaque das palavras</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<SectionFields>
					<div className="grid grid-cols-2 gap-1">
						{HIGHLIGHT_STYLES.map((option) => (
							<Button
								key={option.value}
								size="sm"
								variant={style === option.value ? "secondary" : "outline"}
								className={cn(
									"h-7 text-[11px]",
									style === option.value && "ring-1 ring-primary",
								)}
								onClick={() => set({ highlightStyle: option.value })}
							>
								{option.label}
							</Button>
						))}
					</div>
					<SectionField label="Cor do destaque">
						<ColorPicker
							value={toPickerValue(color)}
							onChange={(next) => preview({ highlightColor: `#${next}` })}
							onChangeEnd={commit}
						/>
					</SectionField>
					<SliderField
						label="Aumentar palavra"
						value={pop}
						min={1}
						max={1.4}
						step={0.02}
						format={(value) => `${Math.round((value - 1) * 100)}%`}
						onPreview={(wordPopScale) => preview({ wordPopScale })}
						onCommit={commit}
					/>
					<Button variant="outline" size="sm" onClick={applyToTrack}>
						Aplicar a toda a faixa
					</Button>
				</SectionFields>
			</SectionContent>
		</Section>
	);
}

const LETTER_STYLES: { value: TextLetterStyle; label: string }[] = [
	{ value: "none", label: "Normal" },
	{ value: "cutout", label: "Recorte colorido" },
	{ value: "cutout-mono", label: "Recorte P&B" },
];

/** Ransom-note letters: each one cut from a different magazine. */
export function LetterStyleSection({
	element,
	trackId,
}: {
	element: TextElement;
	trackId: string;
}) {
	const { set } = useTextUpdater({ element, trackId });
	const style = element.letterStyle ?? "none";
	const isCutout = style !== "none";

	return (
		<Section collapsible defaultOpen={isCutout} sectionKey="text:letters">
			<SectionHeader>
				<SectionTitle>Estilo das letras</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<SectionFields>
					<div className="grid grid-cols-3 gap-1">
						{LETTER_STYLES.map((option) => (
							<Button
								key={option.value}
								size="sm"
								variant={style === option.value ? "secondary" : "outline"}
								className={cn(
									"h-auto min-h-7 whitespace-normal px-1 py-1 text-[11px] leading-tight",
									style === option.value && "ring-1 ring-primary",
								)}
								onClick={() =>
									set({
										letterStyle: option.value,
										...(option.value !== "none" &&
											element.letterSeed === undefined && {
												letterSeed: Math.floor(Math.random() * 1_000_000),
											}),
									})
								}
							>
								{option.label}
							</Button>
						))}
					</div>
					{isCutout && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => set({ letterSeed: Math.floor(Math.random() * 1_000_000) })}
						>
							Sortear de novo
						</Button>
					)}
				</SectionFields>
			</SectionContent>
		</Section>
	);
}

const DEFAULT_GRADIENT: TextGradient = { from: "#FFD60A", to: "#FF4D6D" };

export function GradientSection({
	element,
	trackId,
}: {
	element: TextElement;
	trackId: string;
}) {
	const { set, preview, commit } = useTextUpdater({ element, trackId });
	const gradient = element.fillGradient;
	const enabled = Boolean(gradient);
	const current = gradient ?? DEFAULT_GRADIENT;

	return (
		<Section collapsible defaultOpen={enabled} sectionKey="text:gradient">
			<SectionHeader
				trailing={
					<VisibilityToggle
						enabled={enabled}
						label={enabled ? "Desligar gradiente" : "Ligar gradiente"}
						onToggle={() => set({ fillGradient: enabled ? undefined : current })}
					/>
				}
			>
				<SectionTitle>Gradiente</SectionTitle>
			</SectionHeader>
			<SectionContent className={cn(!enabled && "pointer-events-none opacity-50")}>
				<SectionFields>
					<SectionField label="Cor de cima">
						<ColorPicker
							value={toPickerValue(current.from)}
							onChange={(color) => preview({ fillGradient: { ...current, from: `#${color}` } })}
							onChangeEnd={commit}
						/>
					</SectionField>
					<SectionField label="Cor de baixo">
						<ColorPicker
							value={toPickerValue(current.to)}
							onChange={(color) => preview({ fillGradient: { ...current, to: `#${color}` } })}
							onChangeEnd={commit}
						/>
					</SectionField>
				</SectionFields>
			</SectionContent>
		</Section>
	);
}
