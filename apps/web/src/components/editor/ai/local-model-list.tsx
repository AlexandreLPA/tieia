"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download04Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
	fitNote,
	formatSize,
	type GraphicsCard,
	type LocalModel,
} from "@/lib/local-models";
import { cn } from "@/utils/ui";
import { MODEL_LIST_CLASS, MODEL_ROW_CLASS } from "./model-settings-ui";

/** The part of a local model store the list needs. */
export interface LocalModelSource {
	models: LocalModel[];
	gpu: GraphicsCard | null;
	recommended: string | null;
	selected: string | null;
	error: string | null;
	downloading: string | null;
	select: (name: string) => void;
	download: (name: string) => Promise<void>;
}

function Tag({
	children,
	tone = "muted",
	title,
}: {
	children: React.ReactNode;
	tone?: "muted" | "good" | "primary";
	title?: string;
}) {
	return (
		<span
			title={title}
			className={cn(
				"shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] leading-none whitespace-nowrap",
				tone === "muted" && "bg-accent text-muted-foreground",
				tone === "good" && "bg-green-500/15 text-green-600 dark:text-green-400",
				tone === "primary" && "bg-primary/15 text-primary",
			)}
		>
			{children}
		</span>
	);
}

/**
 * The models of a local service, picked where they are used. Each shows what
 * it weighs, the video memory it needs and whether it is on this PC; one that
 * is not asks before downloading and shows the download's progress.
 */
export function LocalModelList({
	source,
	descriptions,
}: {
	source: LocalModelSource;
	/** Each model's description in Portuguese, by name */
	descriptions: Record<string, string>;
}) {
	const { models, gpu, recommended, selected, error, downloading } = source;
	const [asking, setAsking] = useState<string | null>(null);

	const startDownload = async (model: LocalModel) => {
		setAsking(null);
		try {
			await source.download(model.name);
			source.select(model.name);
			toast.success(`${model.name} baixado e pronto para usar`);
		} catch (cause) {
			toast.error(
				cause instanceof Error ? cause.message : "Falha ao baixar o modelo",
			);
		}
	};

	if (error && models.length === 0) {
		return <p className="text-xs text-yellow-500">{error}</p>;
	}

	return (
		<div className="flex flex-col gap-1.5">
			<div className={MODEL_LIST_CLASS}>
				{models.map((model) => {
					const isSelected = model.name === selected;
					const isDownloading = downloading === model.name || model.loading;
					const note = fitNote(model, gpu);
					const progress = Math.min(
						99,
						Math.round((model.downloaded_mb / model.size_mb) * 100),
					);

					return (
						<div key={model.name} className="flex flex-col">
							<button
								type="button"
								aria-pressed={isSelected}
								disabled={downloading !== null && !isDownloading}
								onClick={() => {
									if (isDownloading) return;
									if (model.downloaded) {
										setAsking(null);
										source.select(model.name);
									} else {
										setAsking(asking === model.name ? null : model.name);
									}
								}}
								className={cn(MODEL_ROW_CLASS, isSelected && "bg-accent")}
							>
								<span className="min-w-0 flex-1">
									<span className="flex flex-wrap items-center gap-1.5 text-sm">
										<span className="truncate">{model.name}</span>
										{model.name === recommended && (
											<Tag
												tone="primary"
												title={
													gpu
														? `O que melhor roda na sua ${gpu.name}`
														: "O que melhor roda num PC sem placa de vídeo"
												}
											>
												Recomendado
											</Tag>
										)}
										{isSelected && model.downloaded && (
											<HugeiconsIcon
												icon={Tick01Icon}
												className="size-3.5 shrink-0"
											/>
										)}
									</span>
									<span className="text-muted-foreground block text-xs leading-snug">
										{descriptions[model.name] ?? model.description}
									</span>
									<span className="mt-1 flex flex-wrap items-center gap-1">
										<Tag title="Memória da placa de vídeo que o modelo precisa">
											{model.vram_gb} GB VRAM
										</Tag>
										{model.downloaded ? (
											<Tag tone="good" title="Já está neste PC">
												Baixado · {formatSize(model.downloaded_mb)}
											</Tag>
										) : (
											<Tag title="O que o download ocupa no disco">
												{formatSize(model.size_mb)}
											</Tag>
										)}
									</span>
									{note && (
										<span className="mt-1 block text-[11px] leading-snug text-yellow-600 dark:text-yellow-500">
											{note}
										</span>
									)}
								</span>
								{!model.downloaded && !isDownloading && (
									<HugeiconsIcon
										icon={Download04Icon}
										className="text-muted-foreground mt-0.5 size-4 shrink-0"
									/>
								)}
							</button>

							{isDownloading && (
								<div className="flex flex-col gap-1 px-2 pb-2">
									<div className="bg-accent h-1.5 overflow-hidden rounded-full">
										<div
											className="bg-primary h-full transition-[width] duration-700"
											style={{ width: `${model.downloaded ? 100 : progress}%` }}
										/>
									</div>
									<span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
										<Spinner className="size-3" />
										{model.downloaded
											? "Carregando o modelo"
											: `Baixando: ${formatSize(model.downloaded_mb)} de ${formatSize(model.size_mb)}`}
									</span>
								</div>
							)}

							{asking === model.name && !isDownloading && (
								<div className="flex items-center gap-2 px-2 pb-2">
									<span className="text-muted-foreground flex-1 text-[11px] leading-snug">
										Baixar {formatSize(model.size_mb)} para este PC?
									</span>
									<Button
										size="sm"
										variant="ghost"
										className="h-6 px-2 text-[11px]"
										onClick={() => setAsking(null)}
									>
										Cancelar
									</Button>
									<Button
										size="sm"
										className="h-6 px-2 text-[11px]"
										onClick={() => startDownload(model)}
									>
										Baixar
									</Button>
								</div>
							)}
						</div>
					);
				})}
			</div>
			<p className="text-muted-foreground text-[11px] leading-relaxed">
				Os modelos rodam no seu PC, sem custo. Só baixa o que você escolher;
				para apagar um, vá em Configuração de IA.
			</p>
		</div>
	);
}
