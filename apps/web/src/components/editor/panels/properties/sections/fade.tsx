import { NumberField } from "@/components/ui/number-field";
import { Slider } from "@/components/ui/slider";
import { useEditor } from "@/hooks/use-editor";
import { getEffectiveFades, getMaxFadeDuration } from "@/lib/animation";
import { clamp } from "@/utils/math";
import type { TimelineElement } from "@/types/timeline";
import { usePropertyDraft } from "../hooks/use-property-draft";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "../section";

const FADE_STEP_SECONDS = 0.1;

function formatSeconds(value: number): string {
	return String(Math.round(value * 100) / 100);
}

export function FadeSection({
	element,
	trackId,
}: {
	element: TimelineElement;
	trackId: string;
}) {
	const editor = useEditor();
	const maxFade = getMaxFadeDuration({ duration: element.duration });
	const { fadeIn, fadeOut } = getEffectiveFades(element);

	const previewFade = (updates: { fadeIn?: number; fadeOut?: number }) =>
		editor.timeline.previewElements({
			updates: [{ trackId, elementId: element.id, updates }],
		});
	const commitFade = () => editor.timeline.commitPreview();

	return (
		<Section collapsible sectionKey={`${element.type}:fade`}>
			<SectionHeader>
				<SectionTitle>Fade</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<SectionFields>
					<FadeField
						label="Entrada"
						value={fadeIn}
						max={maxFade}
						onPreview={(value) => previewFade({ fadeIn: value })}
						onCommit={commitFade}
					/>
					<FadeField
						label="Saída"
						value={fadeOut}
						max={maxFade}
						onPreview={(value) => previewFade({ fadeOut: value })}
						onCommit={commitFade}
					/>
					<p className="text-[10px] leading-snug text-muted-foreground">
						{element.type === "video"
							? "Vale para a imagem e para o som. "
							: ""}
						Cada fade vai até a metade do clipe. Zero desliga.
					</p>
				</SectionFields>
			</SectionContent>
		</Section>
	);
}

function FadeField({
	label,
	value,
	max,
	onPreview,
	onCommit,
}: {
	label: string;
	value: number;
	max: number;
	onPreview: (value: number) => void;
	onCommit: () => void;
}) {
	const draft = usePropertyDraft({
		displayValue: formatSeconds(value),
		parse: (input) => {
			const parsed = Number.parseFloat(input.replace(",", "."));
			if (Number.isNaN(parsed)) return null;
			return clamp({ value: parsed, min: 0, max });
		},
		onPreview,
		onCommit,
	});

	return (
		<SectionField label={label}>
			<div className="flex items-center gap-3">
				<Slider
					className="flex-1"
					min={0}
					max={max}
					step={FADE_STEP_SECONDS}
					value={[value]}
					disabled={max <= 0}
					onValueChange={([next]) => onPreview(Math.round(next * 100) / 100)}
					onValueCommit={onCommit}
				/>
				<div className="flex shrink-0 items-center gap-1">
					<NumberField
						className="w-16"
						value={draft.displayValue}
						onFocus={draft.onFocus}
						onChange={draft.onChange}
						onBlur={draft.onBlur}
						disabled={max <= 0}
						aria-label={`Fade de ${label.toLowerCase()} em segundos`}
					/>
					<span className="text-[10px] text-muted-foreground">s</span>
				</div>
			</div>
		</SectionField>
	);
}
