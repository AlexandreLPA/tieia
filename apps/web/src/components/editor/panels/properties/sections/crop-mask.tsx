import { NumberField } from "@/components/ui/number-field";
import { useEditor } from "@/hooks/use-editor";
import type { VisualElement } from "@/types/timeline";
import type { CropRect, MaskShape } from "@/types/rendering";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "../section";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { CropIcon, Cancel01Icon } from "@hugeicons/core-free-icons";

const MASK_SHAPES: { type: MaskShape["type"]; label: string }[] = [
	{ type: "rectangle", label: "Retângulo" },
	{ type: "ellipse", label: "Elipse" },
	{ type: "polygon", label: "Polígono" },
];

export function CropMaskSection({
	element,
	trackId,
}: {
	element: VisualElement;
	trackId: string;
}) {
	const editor = useEditor();
	const crop = element.crop ?? { top: 0, right: 0, bottom: 0, left: 0 };
	const mask = element.mask;

	const updateCrop = (updates: Partial<CropRect>) => {
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: {
						crop: { ...crop, ...updates },
					},
				},
			],
		});
	};

	const updateMask = (updates: Partial<MaskShape>) => {
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: {
						mask: mask ? { ...mask, ...updates } : { type: "rectangle", feather: 0, inverted: false, ...updates },
					},
				},
			],
		});
	};

	const removeMask = () => {
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: { mask: undefined } as Partial<VisualElement>,
				},
			],
		});
	};

	const resetCrop = () => {
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: { crop: undefined } as Partial<VisualElement>,
				},
			],
		});
	};

	return (
		<>
			<Section collapsible sectionKey={`${element.type}:crop`} showTopBorder>
				<SectionHeader>
					<SectionTitle>Corte</SectionTitle>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-6"
						onClick={resetCrop}
						title="Redefinir corte"
					>
						<HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
					</Button>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<div className="grid grid-cols-2 gap-2">
							<SectionField label="Superior">
								<NumberField
									value={crop.top.toString()}
									onChange={(e) => {
										const n = parseFloat(e.target.value);
										if (!isNaN(n)) updateCrop({ top: Math.max(0, n) });
									}}
									onBlur={() => {}}
									min={0}
									step={1}
								/>
							</SectionField>
							<SectionField label="Inferior">
								<NumberField
									value={crop.bottom.toString()}
									onChange={(e) => {
										const n = parseFloat(e.target.value);
										if (!isNaN(n)) updateCrop({ bottom: Math.max(0, n) });
									}}
									onBlur={() => {}}
									min={0}
									step={1}
								/>
							</SectionField>
							<SectionField label="Esquerda">
								<NumberField
									value={crop.left.toString()}
									onChange={(e) => {
										const n = parseFloat(e.target.value);
										if (!isNaN(n)) updateCrop({ left: Math.max(0, n) });
									}}
									onBlur={() => {}}
									min={0}
									step={1}
								/>
							</SectionField>
							<SectionField label="Direita">
								<NumberField
									value={crop.right.toString()}
									onChange={(e) => {
										const n = parseFloat(e.target.value);
										if (!isNaN(n)) updateCrop({ right: Math.max(0, n) });
									}}
									onBlur={() => {}}
									min={0}
									step={1}
								/>
							</SectionField>
						</div>
					</SectionFields>
				</SectionContent>
			</Section>

			<Section collapsible sectionKey={`${element.type}:mask`} showTopBorder>
				<SectionHeader>
					<SectionTitle>Máscara</SectionTitle>
					{mask && (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-6"
							onClick={removeMask}
							title="Remover máscara"
						>
							<HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
						</Button>
					)}
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						<SectionField label="Forma">
							<div className="flex gap-1">
								{MASK_SHAPES.map((shape) => (
									<Button
										key={shape.type}
										type="button"
										variant={mask?.type === shape.type ? "secondary" : "ghost"}
										size="sm"
										className="flex-1 h-7 text-[10px]"
										onClick={() => updateMask({ type: shape.type })}
									>
										{shape.label}
									</Button>
								))}
							</div>
						</SectionField>
						{mask && (
							<>
								<SectionField label="Suavização">
									<NumberField
										value={(mask.feather * 100).toFixed(0)}
										onChange={(e) => {
											const n = parseFloat(e.target.value);
											if (!isNaN(n)) updateMask({ feather: Math.max(0, Math.min(100, n)) / 100 });
										}}
										onBlur={() => {}}
										min={0}
										max={100}
										step={1}
									/>
								</SectionField>
								<SectionField label="Inverter">
									<Button
										type="button"
										variant={mask.inverted ? "secondary" : "ghost"}
										size="sm"
										className="h-7 text-[10px]"
										onClick={() => updateMask({ inverted: !mask.inverted })}
									>
										{mask.inverted ? "Invertido" : "Normal"}
									</Button>
								</SectionField>
							</>
						)}
					</SectionFields>
				</SectionContent>
			</Section>
		</>
	);
}
