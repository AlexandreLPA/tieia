"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-view";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useEditor } from "@/hooks/use-editor";
import { cn } from "@/utils/ui";
import {
	ARROW_DIRECTIONS,
	type ArrowDirection,
	applyZoom,
	getSfxBuffer,
	type HighlightAnimation,
	type HighlightKind,
	insertHighlight,
	insertSfx,
	type ZoomStyle,
} from "@/lib/tiktok-kit/insert";
import { Switch } from "@/components/ui/switch";
import { usePreviewStore } from "@/stores/preview-store";
import { SFX_LABELS, type SfxKind } from "@/lib/tiktok-kit/sfx";

const ANIMATIONS: { value: HighlightAnimation; label: string }[] = [
	{ value: "bounce", label: "Quicar" },
	{ value: "pulse", label: "Pulsar" },
	{ value: "none", label: "Parada" },
];

const ZOOMS: { value: ZoomStyle; label: string; hint: string }[] = [
	{ value: "punch", label: "Zoom seco", hint: "Pula para 135% no playhead" },
	{ value: "smooth", label: "Zoom suave", hint: "Aproxima em 0,6 s, com saída cúbica" },
	{ value: "in-out", label: "Zoom e volta", hint: "Aproxima e volta em 1,2 s" },
	{
		value: "zoom-out",
		label: "Diminuir zoom",
		hint: "Abre o clipe de 135% para o normal; boa entrada depois de uma transição",
	},
];

const HIGHLIGHTS: { kind: HighlightKind; label: string; done: string }[] = [
	{ kind: "arrow-circle", label: "Seta + círculo", done: "Seta com círculo adicionada" },
	{ kind: "arrow", label: "Só seta", done: "Seta adicionada" },
	{ kind: "circle", label: "Só círculo", done: "Círculo adicionado" },
];

function Section({
	title,
	hint,
	children,
}: {
	title: string;
	hint: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2 border-b pb-4 last:border-b-0">
			<div>
				<Label className="text-xs font-medium">{title}</Label>
				<p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
			</div>
			{children}
		</div>
	);
}

/**
 * The CapCut tricks from TikTok Shop ad edits in one place: feed UI overlay,
 * red arrows and circles, punchy sound effects and product zooms.
 */
export function TikTokKitView() {
	const editor = useEditor();
	const [busy, setBusy] = useState<string | null>(null);
	const [direction, setDirection] = useState<ArrowDirection>("↓");
	const [animation, setAnimation] = useState<HighlightAnimation>("bounce");
	// Arrows get a "poink", zooms a whoosh or hit, like in the reference edits
	const [withSound, setWithSound] = useState(true);
	const { layoutGuide, toggleLayoutGuide } = usePreviewStore();

	const run = async (key: string, action: () => Promise<void>, done: string) => {
		setBusy(key);
		try {
			await action();
			toast.success(done);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Não deu certo");
		} finally {
			setBusy(null);
		}
	};

	const preview = async (kind: SfxKind) => {
		const buffer = await getSfxBuffer(kind);
		const ctx = new AudioContext();
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.connect(ctx.destination);
		source.onended = () => void ctx.close();
		source.start();
	};

	return (
		<PanelView title="Kit TikTok Shop">
			<div className="flex flex-col gap-4 pb-4">
				<p className="text-[11px] leading-snug text-muted-foreground">
					Os elementos entram no ponto do playhead. Arraste no preview para
					posicionar e use as alças para girar ou mudar o tamanho.
				</p>
				<label
					htmlFor="kit-with-sound"
					className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs"
				>
					<span className="flex flex-col">
						Som junto
						<span className="text-[10px] text-muted-foreground">
							Poink nas setas, whoosh ou impacto nos zooms
						</span>
					</span>
					<Switch id="kit-with-sound" checked={withSound} onCheckedChange={setWithSound} />
				</label>

				<Section
					title="Setas e círculos"
					hint="Aponte para o produto, o preço ou a reação. Combine com um efeito sonoro."
				>
					<div className="grid grid-cols-4 gap-1">
						{(Object.keys(ARROW_DIRECTIONS) as ArrowDirection[]).map((dir) => (
							<Button
								key={dir}
								size="sm"
								variant={direction === dir ? "secondary" : "outline"}
								className={cn("h-7 text-base", direction === dir && "ring-1 ring-primary")}
								onClick={() => setDirection(dir)}
								aria-label={`Seta ${dir}`}
							>
								{dir}
							</Button>
						))}
					</div>
					<div className="flex gap-1">
						{ANIMATIONS.map((option) => (
							<Button
								key={option.value}
								size="sm"
								variant={animation === option.value ? "secondary" : "outline"}
								className={cn(
									"h-7 flex-1 text-[11px]",
									animation === option.value && "ring-1 ring-primary",
								)}
								onClick={() => setAnimation(option.value)}
							>
								{option.label}
							</Button>
						))}
					</div>
					<div className="grid grid-cols-3 gap-1">
						{HIGHLIGHTS.map((highlight, index) => (
							<Button
								key={highlight.kind}
								size="sm"
								variant={index === 0 ? "default" : "secondary"}
								className="h-8 px-1 text-[11px]"
								disabled={busy !== null}
								onClick={() =>
									run(
										highlight.kind,
										() =>
											insertHighlight({
												editor,
												kind: highlight.kind,
												direction,
												animation,
												withSound,
											}),
										highlight.done,
									)
								}
							>
								{highlight.label}
							</Button>
						))}
					</div>
				</Section>

				<Section
					title="Efeitos sonoros"
					hint="Toque para ouvir; o + coloca no playhead. Sons gerados pelo app, livres de direitos."
				>
					<div className="flex flex-col gap-1">
						{(Object.keys(SFX_LABELS) as SfxKind[]).map((kind) => (
							<div key={kind} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
								<button
									type="button"
									className="flex min-w-0 flex-1 flex-col text-left"
									onClick={() => void preview(kind)}
									title="Ouvir"
								>
									<span className="text-xs font-medium">▶ {SFX_LABELS[kind].name}</span>
									<span className="truncate text-[10px] text-muted-foreground">
										{SFX_LABELS[kind].hint}
									</span>
								</button>
								<Button
									size="sm"
									variant="outline"
									className="h-7 px-2"
									disabled={busy !== null}
									aria-label={`Adicionar ${SFX_LABELS[kind].name}`}
									onClick={() =>
										run(
											`sfx-${kind}`,
											() => insertSfx({ editor, kind }),
											`${SFX_LABELS[kind].name} adicionado`,
										)
									}
								>
									+
								</Button>
							</div>
						))}
					</div>
				</Section>

				<Section
					title="Zoom no produto"
					hint="Selecione o clipe, posicione o playhead no momento e escolha o zoom."
				>
					<div className="grid grid-cols-2 gap-1">
						{ZOOMS.map((zoom) => (
							<Button
								key={zoom.value}
								size="sm"
								variant="outline"
								className="h-auto flex-col gap-0 py-1.5 text-[11px]"
								title={zoom.hint}
								disabled={busy !== null}
								onClick={async () => {
									setBusy(zoom.value);
									try {
										const result = await applyZoom({ editor, style: zoom.value, withSound });
										if (result.ok) toast.success(`${zoom.label} aplicado`);
										else toast.info(result.reason);
									} finally {
										setBusy(null);
									}
								}}
							>
								{zoom.label}
							</Button>
						))}
					</div>
				</Section>

				<Section
					title="Guia do TikTok"
					hint="Mostra no preview onde ficam a descrição, os botões e as abas, para a legenda e as setas não ficarem por baixo. Não aparece no vídeo exportado."
				>
					<label
						htmlFor="kit-tiktok-guide"
						className="flex items-center justify-between gap-2 text-xs"
					>
						Mostrar guia no preview
						<Switch
							id="kit-tiktok-guide"
							checked={layoutGuide.platform === "tiktok"}
							onCheckedChange={() => toggleLayoutGuide("tiktok")}
						/>
					</label>
				</Section>
			</div>
		</PanelView>
	);
}
