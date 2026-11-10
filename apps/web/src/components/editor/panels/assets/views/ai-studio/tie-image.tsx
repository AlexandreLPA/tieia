"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { toast } from "sonner";
import {
	ArrowDown01Icon,
	ComputerIcon,
	Download04Icon,
	Image01Icon,
	SentIcon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ModelOriginBadge } from "@/components/editor/ai/model-origin-badge";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { useEditor } from "@/hooks/use-editor";
import { SERVICE_URLS } from "@/hooks/use-service-health";
import { aiClient } from "@/lib/ai-client";
import { processMediaAssets } from "@/lib/media/processing";
import { cn } from "@/utils/ui";

// ----- Image models (the image service's list) -----

interface ImageModel {
	name: string;
	description: string;
	/** "~7 GB": what the first use downloads */
	size: string;
	/** "gpu" or "cpu": what the model was made to run on */
	device: string;
	default_steps: number;
	/** Loaded in the image service right now */
	active: boolean;
}

// The service describes its models in English
const DESCRIPTIONS: Record<string, string> = {
	"sdxl-turbo": "Rápido: a imagem sai em 1 a 4 passos",
	"sdxl-base": "A maior qualidade (SDXL 1.0)",
	"stable-diffusion-2-1": "Boa qualidade, para uso geral",
	"sd-1.5": "O clássico SD 1.5",
	"flux-schnell": "FLUX.1 Schnell: rápido e de alta qualidade",
	"segmind-tiny": "Bem leve, para PC sem placa de vídeo",
	"small-sd": "Leve, com qualidade razoável sem placa de vídeo",
};

interface ImageModelsState {
	models: ImageModel[];
	selected: string | null;
	/** Why the list could not be read */
	error: string | null;
	refresh: () => Promise<void>;
	select: (name: string) => void;
}

/** Shared by the picker in the Estúdio's header and the panel that generates. */
export const useImageModels = create<ImageModelsState>((set, get) => ({
	models: [],
	selected: null,
	error: null,
	refresh: async () => {
		try {
			const response = await fetch(`${SERVICE_URLS.image}/models`, {
				signal: AbortSignal.timeout(8000),
			});
			if (!response.ok) throw new Error(String(response.status));
			const data = (await response.json()) as {
				models?: ImageModel[];
				active_model?: string | null;
			};
			const models = data.models ?? [];
			const current = get().selected;
			// Keeps the user's pick; otherwise the loaded model, or else the
			// lightest one, which runs without a graphics card
			const selected =
				(current && models.some((model) => model.name === current)
					? current
					: null) ??
				data.active_model ??
				models.find((model) => model.device === "cpu")?.name ??
				models[0]?.name ??
				null;
			set({ models, selected, error: null });
		} catch {
			set({ error: "O serviço de imagens não respondeu." });
		}
	},
	select: (name) => set({ selected: name }),
}));

async function loadImageModel(name: string): Promise<void> {
	const response = await fetch(
		`${SERVICE_URLS.image}/load?model_name=${encodeURIComponent(name)}`,
		// The first use downloads the model, several GB
		{ method: "POST", signal: AbortSignal.timeout(60 * 60 * 1000) },
	);
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as {
			detail?: string;
		} | null;
		throw new Error(body?.detail || "Não foi possível carregar o modelo.");
	}
}

/** The image model, picked in the Estúdio's header while in Tiê Image. */
export function ImageModelPicker({ className }: { className?: string }) {
	const { models, selected, error, refresh, select } = useImageModels();
	const [isOpen, setIsOpen] = useState(false);

	useEffect(() => {
		refresh();
	}, [refresh]);

	if (models.length === 0 && !error) return null;

	return (
		<Popover
			open={isOpen}
			onOpenChange={(open) => {
				setIsOpen(open);
				if (open) refresh();
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					data-ui-target="ai/image-model"
					aria-label={`Modelo de imagem: ${selected ?? "nenhum"}`}
					className={cn(
						"text-muted-foreground hover:text-foreground hover:bg-accent flex min-w-0 items-center gap-1.5 rounded-sm px-1.5 py-1 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
						className,
					)}
				>
					<HugeiconsIcon icon={ComputerIcon} className="size-3.5 shrink-0" />
					<span className="truncate">{selected ?? "Modelo de imagem"}</span>
					<HugeiconsIcon icon={ArrowDown01Icon} className="size-3 shrink-0" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				side="bottom"
				align="start"
				className="w-[26rem] max-w-[calc(100vw-1rem)] p-0"
			>
				<p className="text-muted-foreground border-b px-3 py-2 text-[11px] leading-relaxed">
					Modelos de imagem · grátis, rodam no seu PC. O primeiro uso de cada um
					baixa o modelo.
				</p>
				{error && <p className="px-3 py-2 text-xs text-yellow-500">{error}</p>}
				<div className="max-h-72 overflow-y-auto p-1">
					{models.map((model) => (
						<button
							key={model.name}
							type="button"
							aria-pressed={model.name === selected}
							onClick={() => {
								select(model.name);
								setIsOpen(false);
							}}
							className={cn(
								"hover:bg-accent flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left",
								model.name === selected && "bg-accent",
							)}
						>
							<span className="min-w-0 flex-1">
								<span className="flex items-center gap-1.5 text-sm">
									<span className="truncate">{model.name}</span>
									<ModelOriginBadge origin="local" />
									{model.name === selected && (
										<HugeiconsIcon
											icon={Tick01Icon}
											className="size-3.5 shrink-0"
										/>
									)}
								</span>
								<span className="text-muted-foreground block text-[11px] leading-snug">
									{DESCRIPTIONS[model.name] ?? model.description}
								</span>
								<span className="text-muted-foreground block text-[11px]">
									{model.size.replace("~", "cerca de ")} ·{" "}
									{model.device === "cpu"
										? "roda sem placa de vídeo"
										: "feito para placa de vídeo"}
									{model.active ? " · carregado" : ""}
								</span>
							</span>
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

// ----- Generation -----

type Ratio = "16:9" | "9:16" | "1:1";

const RATIOS: { id: Ratio; label: string }[] = [
	{ id: "16:9", label: "Paisagem" },
	{ id: "9:16", label: "Retrato" },
	{ id: "1:1", label: "Quadrado" },
];

/** Sizes each family was trained near; all multiples of 8, as diffusion needs. */
function sizeFor(
	model: string,
	ratio: Ratio,
): { width: number; height: number } {
	const large = /xl|flux/i.test(model);
	const long = large ? 1024 : 768;
	const short = large ? 576 : 432;
	const square = large ? 1024 : 512;
	if (ratio === "16:9") return { width: long, height: short };
	if (ratio === "9:16") return { width: short, height: long };
	return { width: square, height: square };
}

interface GeneratedImage {
	id: number;
	prompt: string;
	ratio: Ratio;
	model: string;
	status: "working" | "done" | "error";
	/** What is happening, or what went wrong */
	detail?: string;
	/** When the work began (epoch ms), for the clock shown while it runs */
	startedAt: number;
	blob?: Blob;
	url?: string;
}

const STARTERS = [
	"Miniatura chamativa para um vídeo de receitas, luz quente",
	"Fundo abstrato em tons de vermelho e preto, para colocar texto por cima",
	"Foto de produto em estúdio, fundo branco, sombra suave",
];

function clock(seconds: number): string {
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

let nextImageId = 1;

/**
 * The images made since the editor opened. Kept outside the panel so they are
 * still there after a visit to the chat or to another tool.
 */
const useGeneratedImages = create<{
	images: GeneratedImage[];
	add: (image: GeneratedImage) => void;
	patch: (id: number, change: Partial<GeneratedImage>) => void;
}>((set) => ({
	images: [],
	add: (image) => set((state) => ({ images: [...state.images, image] })),
	patch: (id, change) =>
		set((state) => ({
			images: state.images.map((image) =>
				image.id === id ? { ...image, ...change } : image,
			),
		})),
}));

/**
 * Tiê Image: describes an image, gets it generated by the image service on
 * this PC, and sends it to the project's media.
 */
export function TieImagePanel() {
	const editor = useEditor();
	const { models, selected, error, refresh } = useImageModels();
	const [prompt, setPrompt] = useState("");
	const [ratio, setRatio] = useState<Ratio>("16:9");
	const { images, add, patch } = useGeneratedImages();
	const [now, setNow] = useState(() => Date.now());
	const scrollRef = useRef<HTMLDivElement>(null);

	const isBusy = images.some((image) => image.status === "working");

	useEffect(() => {
		refresh();
	}, [refresh]);

	// Without a graphics card an image takes minutes: show the time passing
	useEffect(() => {
		if (!isBusy) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [isBusy]);

	const imageCount = images.length;
	// biome-ignore lint/correctness/useExhaustiveDependencies: scrolls when an image is added
	useEffect(() => {
		scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
	}, [imageCount]);

	const generate = useCallback(
		async (text: string) => {
			const description = text.trim();
			const model = models.find((entry) => entry.name === selected);
			if (!description || !model || isBusy) return;

			const id = nextImageId++;
			add({
				id,
				prompt: description,
				ratio,
				model: model.name,
				status: "working",
				startedAt: Date.now(),
				detail: model.active
					? "Gerando a imagem"
					: `Carregando ${model.name} (o primeiro uso baixa ${model.size.replace("~", "cerca de ")})`,
			});
			setPrompt("");

			try {
				if (!model.active) {
					await loadImageModel(model.name);
					await refresh();
					patch(id, { detail: "Gerando a imagem" });
				}
				const blob = await aiClient.generateImageBlob({
					prompt: description,
					...sizeFor(model.name, ratio),
					steps: model.default_steps,
					// The few-step models are trained to run without guidance
					guidanceScale: /turbo|schnell/i.test(model.name) ? 0 : 7.5,
				});
				patch(id, {
					status: "done",
					blob,
					url: URL.createObjectURL(blob),
					detail: undefined,
				});
			} catch (cause) {
				patch(id, {
					status: "error",
					detail:
						cause instanceof Error && cause.message
							? cause.message
							: "Não foi possível gerar a imagem.",
				});
			}
		},
		[models, selected, isBusy, ratio, refresh, add, patch],
	);

	const addToMedia = useCallback(
		async (image: GeneratedImage) => {
			const project = editor.project.getActive();
			if (!image.blob || !project) return;
			try {
				const file = new File([image.blob], `tie-image-${image.id}.png`, {
					type: "image/png",
				});
				const processed = await processMediaAssets({ files: [file] });
				for (const asset of processed) {
					await editor.media.addMediaAsset({
						projectId: project.metadata.id,
						asset,
					});
				}
				toast.success("Imagem adicionada às mídias");
			} catch {
				toast.error("Falha ao adicionar a imagem às mídias");
			}
		},
		[editor],
	);

	const canSend = prompt.trim().length > 0 && !isBusy && selected !== null;

	return (
		<>
			<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
				{images.length === 0 ? (
					<div className="flex flex-col gap-3 py-4">
						<div className="text-center">
							<HugeiconsIcon
								icon={Image01Icon}
								className="text-muted-foreground/40 mx-auto mb-2 size-8"
							/>
							<p className="text-sm font-medium">Tiê Image</p>
							<p className="text-muted-foreground mt-1 text-xs leading-relaxed">
								Descreva a imagem. Ela é gerada no seu PC e pode ir direto para
								as mídias do projeto.
							</p>
						</div>
						{error && (
							<p className="rounded-md bg-yellow-500/10 px-3 py-2 text-xs text-yellow-500">
								{error} Confira em Gerenciar serviços de IA se o serviço de
								imagens está ligado.
							</p>
						)}
						<div className="flex flex-col gap-1.5">
							{STARTERS.map((starter) => (
								<button
									key={starter}
									type="button"
									onClick={() => setPrompt(starter)}
									className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-full border px-3 py-1.5 text-left text-xs"
								>
									{starter}
								</button>
							))}
						</div>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						{images.map((image) => (
							<div key={image.id} className="flex flex-col gap-1.5">
								<p className="bg-primary text-primary-foreground ml-auto max-w-[85%] rounded-lg px-3 py-1.5 text-xs">
									{image.prompt}
								</p>
								{image.status === "working" && (
									<p className="text-muted-foreground flex items-center gap-2 text-xs">
										<Spinner className="size-3" />
										{image.detail}…{" "}
										{clock(
											Math.max(0, Math.round((now - image.startedAt) / 1000)),
										)}
									</p>
								)}
								{image.status === "error" && (
									<p className="text-destructive text-xs leading-relaxed">
										{image.detail}
									</p>
								)}
								{image.status === "done" && image.url && (
									<div className="flex flex-col gap-1.5">
										{/* biome-ignore lint/performance/noImgElement: a blob URL, which next/image does not optimize */}
										<img
											src={image.url}
											alt={image.prompt}
											className="max-h-80 w-full rounded-lg border object-contain"
										/>
										<div className="flex flex-wrap items-center gap-1.5">
											<Button
												size="sm"
												className="h-7 text-xs"
												onClick={() => addToMedia(image)}
											>
												Adicionar às mídias
											</Button>
											<Button
												asChild
												size="sm"
												variant="outline"
												className="h-7 gap-1 text-xs"
											>
												<a
													href={image.url}
													download={`tie-image-${image.id}.png`}
												>
													<HugeiconsIcon
														icon={Download04Icon}
														className="size-3.5"
													/>
													Baixar
												</a>
											</Button>
											<span className="text-muted-foreground text-[11px]">
												{image.model} · {image.ratio}
											</span>
										</div>
									</div>
								)}
							</div>
						))}
					</div>
				)}
			</div>

			<div className="bg-background shrink-0 border-t px-2 py-2">
				<div className="mb-1.5 flex flex-wrap items-center gap-1.5">
					<span className="text-muted-foreground text-[11px]">Proporção</span>
					<div className="bg-accent/60 flex rounded-full p-0.5">
						{RATIOS.map((option) => (
							<button
								key={option.id}
								type="button"
								aria-pressed={ratio === option.id}
								title={option.id}
								onClick={() => setRatio(option.id)}
								className={cn(
									"text-muted-foreground hover:text-foreground rounded-full px-2 py-0.5 text-[11px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
									ratio === option.id &&
										"bg-background text-foreground shadow-sm",
								)}
							>
								{option.label}
							</button>
						))}
					</div>
				</div>
				<div className="flex items-end gap-1.5">
					<textarea
						value={prompt}
						onChange={(event) => setPrompt(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								generate(prompt);
							}
						}}
						placeholder="Descreva sua imagem..."
						aria-label="Descrição da imagem"
						rows={1}
						className="placeholder:text-muted-foreground/50 max-h-[100px] min-h-[36px] flex-1 resize-none rounded-md border bg-transparent px-2.5 py-2 text-xs outline-none focus:ring-1 focus:ring-ring"
						style={{ fieldSizing: "content" } as React.CSSProperties}
					/>
					<Button
						size="icon"
						variant={canSend ? "default" : "secondary"}
						className="size-[36px] shrink-0"
						aria-label="Gerar imagem"
						onClick={() => generate(prompt)}
						disabled={!canSend}
					>
						{isBusy ? (
							<Spinner className="size-3.5" />
						) : (
							<HugeiconsIcon icon={SentIcon} className="size-3.5" />
						)}
					</Button>
				</div>
			</div>
		</>
	);
}
