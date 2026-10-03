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
	insertFeedOverlay,
	insertHighlight,
	insertSfx,
	type ZoomStyle,
} from "@/lib/tiktok-kit/insert";
import { SFX_LABELS, type SfxKind } from "@/lib/tiktok-kit/sfx";

const ANIMATIONS: { value: HighlightAnimation; label: string }[] = [
	{ value: "bounce", label: "Quicar" },
	{ value: "pulse", label: "Pulsar" },
	{ value: "none", label: "Parada" },
];

const ZOOMS: { value: ZoomStyle; label: string; hint: string }[] = [
	{ value: "punch", label: "Zoom seco", hint: "Pula para 135% no playhead" },
	{ value: "smooth", label: "Zoom suave", hint: "Aproxima em 0,6 s" },
	{ value: "in-out", label: "Zoom e volta", hint: "Aproxima e volta em 1,2 s" },
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
					<div className="flex gap-2">
						<Button
							className="flex-1"
							size="sm"
							disabled={busy !== null}
							onClick={() =>
								run(
									"arrow",
									() => insertHighlight({ editor, kind: "arrow", direction, animation }),
									"Seta adicionada",
								)
							}
						>
							Adicionar seta
						</Button>
						<Button
							className="flex-1"
							size="sm"
							variant="secondary"
							disabled={busy !== null}
							onClick={() =>
								run(
									"circle",
									() =>
										insertHighlight({
											editor,
											kind: "circle",
											animation: animation === "bounce" ? "pulse" : animation,
										}),
									"Círculo adicionado",
								)
							}
						>
							Adicionar círculo
						</Button>
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
					<div className="grid grid-cols-3 gap-1">
						{ZOOMS.map((zoom) => (
							<Button
								key={zoom.value}
								size="sm"
								variant="outline"
								className="h-auto flex-col gap-0 py-1.5 text-[11px]"
								title={zoom.hint}
								onClick={() => {
									const result = applyZoom({ editor, style: zoom.value });
									if (result.ok) toast.success(`${zoom.label} aplicado`);
									else toast.info(result.reason);
								}}
							>
								{zoom.label}
							</Button>
						))}
					</div>
				</Section>

				<Section
					title="Interface do feed"
					hint="Faz o vídeo parecer um post no feed (hora, abas, curtidas, perfil e etiqueta de produto)."
				>
					<Button
						size="sm"
						variant="secondary"
						disabled={busy !== null}
						onClick={() =>
							run("feed", () => insertFeedOverlay(editor), "Interface do feed adicionada")
						}
					>
						Adicionar interface do feed
					</Button>
					<p className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-2 text-[10px] leading-snug text-muted-foreground">
						Atenção: imitar a interface da plataforma pode ser recusado em
						anúncios pagos do TikTok. Para vídeo orgânico de afiliado, costuma
						passar; confira na aba Conformidade TikTok antes de publicar.
					</p>
				</Section>
			</div>
		</PanelView>
	);
}
