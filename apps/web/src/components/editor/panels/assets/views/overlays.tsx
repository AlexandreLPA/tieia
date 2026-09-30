"use client";

import { useCallback } from "react";
import { cn } from "@/utils/ui";
import { PanelView } from "./base-view";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/hooks/use-editor";
import { toast } from "sonner";
import type { TimelineElement } from "@/types/timeline";

interface OverlayPreset {
	id: string;
	name: string;
	description: string;
	category: string;
	apply: (params: {
		editor: ReturnType<typeof useEditor>;
		selectedElement: { trackId: string; element: TimelineElement } | null;
	}) => void;
}

export function OverlaysView() {
	const editor = useEditor();

	const getSelectedElement = useCallback((): {
		trackId: string;
		element: TimelineElement;
	} | null => {
		const selected = editor.selection.getSelectedElements();
		if (selected.length === 0) return null;
		const matched = editor.timeline.getElementsWithTracks({
			elements: [selected[0]],
		});
		if (matched.length === 0) return null;
		return { trackId: matched[0].track.id, element: matched[0].element };
	}, [editor]);

	const handleApplyPreset = useCallback(
		(preset: OverlayPreset) => {
			const selectedElement = getSelectedElement();
			preset.apply({ editor, selectedElement });
		},
		[editor, getSelectedElement],
	);

	return (
		<PanelView title="Sobreposições">
			<div className="flex flex-col gap-4">
				<p className="text-xs text-muted-foreground leading-relaxed">
					Adicione camadas de sobreposição para picture-in-picture, telas
					divididas e composição. Selecione um clipe primeiro ou use os predefinidos.
				</p>

				{OVERLAY_CATEGORIES.map((category) => (
					<div key={category.name} className="flex flex-col gap-2">
						<h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
							{category.name}
						</h3>
						<div className="grid grid-cols-2 gap-1.5">
							{category.presets.map((preset) => (
								<button
									key={preset.id}
									type="button"
									onClick={() => handleApplyPreset(preset)}
									className={cn(
										"flex flex-col items-center gap-1.5 rounded-lg border p-2.5",
										"hover:bg-accent/50 hover:border-primary/30 transition-colors cursor-pointer text-center",
									)}
								>
									<div className="size-10 rounded border bg-muted/50 flex items-center justify-center">
										<OverlayIcon preset={preset} />
									</div>
									<span className="text-[10px] font-medium leading-tight">
										{preset.name}
									</span>
								</button>
							))}
						</div>
					</div>
				))}

				<div className="flex flex-col gap-2 pt-2 border-t">
					<h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
						Clipe selecionado
					</h3>
					<div className="grid grid-cols-2 gap-1.5">
						<Button
							variant="outline"
							size="sm"
							className="text-[10px] h-7"
							onClick={() => applyToSelected(editor, { opacity: 0.5 })}
						>
							50% de opacidade
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="text-[10px] h-7"
							onClick={() => applyToSelected(editor, { opacity: 0.3 })}
						>
							30% de opacidade
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="text-[10px] h-7"
							onClick={() =>
								applyToSelected(editor, { blendMode: "screen" })
							}
						>
							Mesclagem Tela
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="text-[10px] h-7"
							onClick={() =>
								applyToSelected(editor, { blendMode: "multiply" })
							}
						>
							Mesclagem Multiplicar
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="text-[10px] h-7"
							onClick={() =>
								applyToSelected(editor, { blendMode: "overlay" })
							}
						>
							Mesclagem Sobrepor
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="text-[10px] h-7"
							onClick={() =>
								applyToSelected(editor, { blendMode: "difference" })
							}
						>
							Diferença
						</Button>
					</div>
				</div>
			</div>
		</PanelView>
	);
}

function applyToSelected(
	editor: ReturnType<typeof useEditor>,
	updates: Partial<TimelineElement>,
) {
	const selected = editor.selection.getSelectedElements();
	if (selected.length === 0) {
		toast.error("Selecione um clipe primeiro");
		return;
	}
	editor.timeline.updateElements({
		updates: selected.map(({ trackId, elementId }) => ({
			trackId,
			elementId,
			updates,
		})),
	});
	toast.success("Aplicado ao clipe selecionado");
}

function OverlayIcon({ preset }: { preset: OverlayPreset }) {
	const category = preset.category;
	if (category === "pip") {
		return (
			<div className="relative size-8">
				<div className="absolute inset-0 rounded-sm bg-primary/20 border border-primary/30" />
				<div className="absolute bottom-0.5 right-0.5 size-3 rounded-sm bg-primary/50 border border-primary/60" />
			</div>
		);
	}
	if (category === "split") {
		return (
			<div className="relative size-8 flex">
				<div className="flex-1 rounded-l-sm bg-primary/20 border border-primary/30" />
				<div className="flex-1 rounded-r-sm bg-primary/40 border border-primary/30" />
			</div>
		);
	}
	if (category === "compositing") {
		return (
			<div className="relative size-8">
				<div className="absolute inset-0 rounded-sm bg-primary/15 border border-primary/20" />
				<div className="absolute inset-1 rounded-sm bg-primary/30 border border-primary/40" />
			</div>
		);
	}
	return (
		<div className="size-8 rounded-sm bg-primary/20 border border-primary/30" />
	);
}

// --- Preset Definitions ---

const OVERLAY_CATEGORIES: { name: string; presets: OverlayPreset[] }[] = [
	{
		name: "Picture in Picture",
		presets: [
			{
				id: "pip-bottom-right",
				name: "PiP Inferior Direito",
				description: "Sobreposição pequena no canto inferior direito",
				category: "pip",
				apply: ({ editor, selectedElement }) => {
					if (!selectedElement) {
						toast.error("Selecione um clipe de vídeo para transformá-lo em uma sobreposição PiP");
						return;
					}
					const canvas = editor.project.getActive().settings.canvasSize;
					editor.timeline.updateElements({
						updates: [{
							trackId: selectedElement.trackId,
							elementId: selectedElement.element.id,
							updates: {
								transform: {
									scale: 0.3,
									position: {
										x: canvas.width * 0.32,
										y: canvas.height * 0.32,
									},
									rotate: 0,
								},
								opacity: 1,
							},
						}],
					});
					toast.success("Sobreposição PiP aplicada — inferior direito");
				},
			},
			{
				id: "pip-bottom-left",
				name: "PiP Inferior Esquerdo",
				description: "Sobreposição pequena no canto inferior esquerdo",
				category: "pip",
				apply: ({ editor, selectedElement }) => {
					if (!selectedElement) {
						toast.error("Selecione um clipe de vídeo para transformá-lo em uma sobreposição PiP");
						return;
					}
					const canvas = editor.project.getActive().settings.canvasSize;
					editor.timeline.updateElements({
						updates: [{
							trackId: selectedElement.trackId,
							elementId: selectedElement.element.id,
							updates: {
								transform: {
									scale: 0.3,
									position: {
										x: -canvas.width * 0.32,
										y: canvas.height * 0.32,
									},
									rotate: 0,
								},
								opacity: 1,
							},
						}],
					});
					toast.success("Sobreposição PiP aplicada — inferior esquerdo");
				},
			},
			{
				id: "pip-top-right",
				name: "PiP Superior Direito",
				description: "Sobreposição pequena no canto superior direito",
				category: "pip",
				apply: ({ editor, selectedElement }) => {
					if (!selectedElement) {
						toast.error("Selecione um clipe de vídeo para transformá-lo em uma sobreposição PiP");
						return;
					}
					const canvas = editor.project.getActive().settings.canvasSize;
					editor.timeline.updateElements({
						updates: [{
							trackId: selectedElement.trackId,
							elementId: selectedElement.element.id,
							updates: {
								transform: {
									scale: 0.3,
									position: {
										x: canvas.width * 0.32,
										y: -canvas.height * 0.32,
									},
									rotate: 0,
								},
								opacity: 1,
							},
						}],
					});
					toast.success("Sobreposição PiP aplicada — superior direito");
				},
			},
			{
				id: "pip-center",
				name: "PiP Central",
				description: "Sobreposição média centralizada na tela",
				category: "pip",
				apply: ({ editor, selectedElement }) => {
					if (!selectedElement) {
						toast.error("Selecione um clipe de vídeo para transformá-lo em uma sobreposição PiP");
						return;
					}
					editor.timeline.updateElements({
						updates: [{
							trackId: selectedElement.trackId,
							elementId: selectedElement.element.id,
							updates: {
								transform: {
									scale: 0.5,
									position: { x: 0, y: 0 },
									rotate: 0,
								},
								opacity: 1,
							},
						}],
					});
					toast.success("Sobreposição PiP aplicada — centro");
				},
			},
		],
	},
	{
		name: "Tela Dividida",
		presets: [
			{
				id: "split-left",
				name: "Metade Esquerda",
				description: "Redimensiona para preencher a metade esquerda da tela",
				category: "split",
				apply: ({ editor, selectedElement }) => {
					if (!selectedElement) {
						toast.error("Selecione um clipe de vídeo");
						return;
					}
					const canvas = editor.project.getActive().settings.canvasSize;
					editor.timeline.updateElements({
						updates: [{
							trackId: selectedElement.trackId,
							elementId: selectedElement.element.id,
							updates: {
								transform: {
									scale: 0.5,
									position: { x: -canvas.width * 0.25, y: 0 },
									rotate: 0,
								},
								opacity: 1,
							},
						}],
					});
					toast.success("Tela dividida — metade esquerda");
				},
			},
			{
				id: "split-right",
				name: "Metade Direita",
				description: "Redimensiona para preencher a metade direita da tela",
				category: "split",
				apply: ({ editor, selectedElement }) => {
					if (!selectedElement) {
						toast.error("Selecione um clipe de vídeo");
						return;
					}
					const canvas = editor.project.getActive().settings.canvasSize;
					editor.timeline.updateElements({
						updates: [{
							trackId: selectedElement.trackId,
							elementId: selectedElement.element.id,
							updates: {
								transform: {
									scale: 0.5,
									position: { x: canvas.width * 0.25, y: 0 },
									rotate: 0,
								},
								opacity: 1,
							},
						}],
					});
					toast.success("Tela dividida — metade direita");
				},
			},
			{
				id: "split-top",
				name: "Metade Superior",
				description: "Redimensiona para preencher a metade superior",
				category: "split",
				apply: ({ editor, selectedElement }) => {
					if (!selectedElement) {
						toast.error("Selecione um clipe de vídeo");
						return;
					}
					const canvas = editor.project.getActive().settings.canvasSize;
					editor.timeline.updateElements({
						updates: [{
							trackId: selectedElement.trackId,
							elementId: selectedElement.element.id,
							updates: {
								transform: {
									scale: 0.5,
									position: { x: 0, y: -canvas.height * 0.25 },
									rotate: 0,
								},
								opacity: 1,
							},
						}],
					});
					toast.success("Tela dividida — metade superior");
				},
			},
			{
				id: "split-bottom",
				name: "Metade Inferior",
				description: "Redimensiona para preencher a metade inferior",
				category: "split",
				apply: ({ editor, selectedElement }) => {
					if (!selectedElement) {
						toast.error("Selecione um clipe de vídeo");
						return;
					}
					const canvas = editor.project.getActive().settings.canvasSize;
					editor.timeline.updateElements({
						updates: [{
							trackId: selectedElement.trackId,
							elementId: selectedElement.element.id,
							updates: {
								transform: {
									scale: 0.5,
									position: { x: 0, y: canvas.height * 0.25 },
									rotate: 0,
								},
								opacity: 1,
							},
						}],
					});
					toast.success("Tela dividida — metade inferior");
				},
			},
		],
	},
	{
		name: "Composição",
		presets: [
			{
				id: "ghost-overlay",
				name: "Sobreposição Fantasma",
				description: "Sobreposição semitransparente com mesclagem tela",
				category: "compositing",
				apply: ({ editor, selectedElement }) => {
					if (!selectedElement) {
						toast.error("Selecione um clipe");
						return;
					}
					editor.timeline.updateElements({
						updates: [{
							trackId: selectedElement.trackId,
							elementId: selectedElement.element.id,
							updates: {
								opacity: 0.4,
								blendMode: "screen",
								transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							},
						}],
					});
					toast.success("Sobreposição fantasma aplicada");
				},
			},
			{
				id: "dark-overlay",
				name: "Sobreposição Escura",
				description: "Mesclagem escurecer para composições atmosféricas",
				category: "compositing",
				apply: ({ editor, selectedElement }) => {
					if (!selectedElement) {
						toast.error("Selecione um clipe");
						return;
					}
					editor.timeline.updateElements({
						updates: [{
							trackId: selectedElement.trackId,
							elementId: selectedElement.element.id,
							updates: {
								opacity: 0.6,
								blendMode: "multiply",
								transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							},
						}],
					});
					toast.success("Sobreposição escura aplicada");
				},
			},
			{
				id: "light-leak",
				name: "Vazamento de Luz",
				description: "Sobreposição clara com mesclagem subexposição de cor",
				category: "compositing",
				apply: ({ editor, selectedElement }) => {
					if (!selectedElement) {
						toast.error("Selecione um clipe");
						return;
					}
					editor.timeline.updateElements({
						updates: [{
							trackId: selectedElement.trackId,
							elementId: selectedElement.element.id,
							updates: {
								opacity: 0.35,
								blendMode: "color-dodge",
								transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							},
						}],
					});
					toast.success("Sobreposição de vazamento de luz aplicada");
				},
			},
			{
				id: "reset-overlay",
				name: "Redefinir para Normal",
				description: "Redefine para tamanho total, mesclagem normal e opacidade total",
				category: "compositing",
				apply: ({ editor, selectedElement }) => {
					if (!selectedElement) {
						toast.error("Selecione um clipe");
						return;
					}
					editor.timeline.updateElements({
						updates: [{
							trackId: selectedElement.trackId,
							elementId: selectedElement.element.id,
							updates: {
								opacity: 1,
								blendMode: "normal",
								transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							},
						}],
					});
					toast.success("Redefinido para normal");
				},
			},
		],
	},
];
