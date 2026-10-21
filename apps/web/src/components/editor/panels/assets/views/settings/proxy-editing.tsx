"use client";

import { useCallback, useState } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useEditor } from "@/hooks/use-editor";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/ui";
import type { ProxyResolution } from "@/services/storage/types";


// ----- Proxy Editing Section -----

const PROXY_RESOLUTION_OPTIONS: Array<{
	value: ProxyResolution;
	label: string;
	description: string;
}> = [
	{
		value: "480p",
		label: "480p",
		description: "Arquivos menores, edição mais rápida",
	},
	{
		value: "720p",
		label: "720p",
		description: "Bom equilíbrio entre qualidade e velocidade",
	},
	{
		value: "1080p",
		label: "1080p",
		description: "Pré-visualização de maior qualidade, arquivos maiores",
	},
];

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProxyEditingSection() {
	const editor = useEditor();
	const activeProject = editor.project.getActive();
	const mediaAssets = editor.media.getAssets();
	const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
	const [progressMap, setProgressMap] = useState<Record<string, number>>({});

	const proxyEnabled = activeProject.settings.proxyEditing ?? false;
	const proxyResolution = activeProject.settings.proxyResolution ?? "720p";

	const highResAssets = mediaAssets.filter(
		(a) =>
			a.type === "video" &&
			a.width &&
			a.height &&
			(a.width > 1920 || a.height > 1080),
	);

	const toggleProxy = useCallback(() => {
		editor.project.updateSettings({
			settings: { proxyEditing: !proxyEnabled },
		});
	}, [editor, proxyEnabled]);

	const handleResolutionChange = useCallback(
		(value: string) => {
			editor.project.updateSettings({
				settings: { proxyResolution: value as ProxyResolution },
			});
		},
		[editor],
	);

	const handleGenerate = useCallback(
		async (assetId: string) => {
			const projectId = activeProject.metadata.id;
			setGeneratingIds((prev) => new Set(prev).add(assetId));
			setProgressMap((prev) => ({ ...prev, [assetId]: 0 }));

			await editor.media.generateProxyForAsset({
				assetId,
				projectId,
				resolution: proxyResolution,
				onProgress: (progress) => {
					setProgressMap((prev) => ({ ...prev, [assetId]: progress }));
				},
			});

			setGeneratingIds((prev) => {
				const next = new Set(prev);
				next.delete(assetId);
				return next;
			});
			setProgressMap((prev) => {
				const next = { ...prev };
				delete next[assetId];
				return next;
			});
		},
		[activeProject, editor, proxyResolution],
	);

	const handleGenerateAll = useCallback(async () => {
		const assetsNeedingProxy = highResAssets.filter((a) => !a.proxy);
		for (const asset of assetsNeedingProxy) {
			await handleGenerate(asset.id);
		}
	}, [highResAssets, handleGenerate]);

	const handleDelete = useCallback(
		async (assetId: string) => {
			const projectId = activeProject.metadata.id;
			await editor.media.deleteProxyForAsset({ assetId, projectId });
		},
		[activeProject, editor],
	);

	return (
		<div className="flex flex-col gap-3">
			<p className="text-[11px] text-muted-foreground leading-relaxed">
				Gera cópias em resolução menor dos vídeos em alta resolução (&gt;1080p)
				para uma pré-visualização mais fluida. As exportações sempre usam os
				arquivos originais.
			</p>

			<div className="flex items-center justify-between">
				<Label className="text-xs">Ativar edição por proxy</Label>
				<button
					type="button"
					onClick={toggleProxy}
					className={cn(
						"relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
						proxyEnabled ? "bg-primary" : "bg-input",
					)}
				>
					<span
						className={cn(
							"pointer-events-none inline-block size-3 rounded-full bg-background shadow-lg ring-0 transition-transform",
							proxyEnabled ? "translate-x-3" : "translate-x-0",
						)}
					/>
				</button>
			</div>

			{proxyEnabled && (
				<>
					<div className="flex flex-col gap-1.5">
						<Label className="text-xs">Resolução do proxy</Label>
						<Select
							value={proxyResolution}
							onValueChange={handleResolutionChange}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{PROXY_RESOLUTION_OPTIONS.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label} — {opt.description}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{highResAssets.length > 0 && (
						<div className="flex flex-col gap-1.5">
							<div className="flex items-center justify-between">
								<Label className="text-xs">
									Vídeos em alta resolução ({highResAssets.length})
								</Label>
								{highResAssets.some((a) => !a.proxy) && (
									<button
										type="button"
										className="text-[9px] text-primary hover:underline"
										onClick={handleGenerateAll}
										disabled={generatingIds.size > 0}
									>
										Gerar todos
									</button>
								)}
							</div>
							<div className="flex flex-col gap-1">
								{highResAssets.map((asset) => {
									const isGenerating = generatingIds.has(asset.id);
									const progress = progressMap[asset.id];
									return (
										<div
											key={asset.id}
											className="flex items-center gap-2 rounded-md border px-2 py-1.5"
										>
											<span
												className={cn(
													"size-1.5 rounded-full shrink-0",
													asset.proxy
														? "bg-green-500"
														: isGenerating
															? "bg-yellow-500 animate-pulse"
															: "bg-muted-foreground/30",
												)}
											/>
											<span className="text-[10px] truncate flex-1 min-w-0">
												{asset.name}
											</span>
											<span className="text-[9px] text-muted-foreground shrink-0">
												{asset.width}x{asset.height}
											</span>
											{asset.proxy && (
												<Badge
													variant="secondary"
													className="text-[8px] px-1 py-0 shrink-0"
												>
													{formatBytes(asset.proxy.fileSize)}
												</Badge>
											)}
											{isGenerating && (
												<span className="text-[9px] text-muted-foreground shrink-0">
													{Math.round(progress * 100)}%
												</span>
											)}
											{!asset.proxy && !isGenerating && (
												<button
													type="button"
													className="text-[9px] text-primary hover:underline shrink-0"
													onClick={() => handleGenerate(asset.id)}
												>
													Gerar
												</button>
											)}
											{isGenerating && (
												<button
													type="button"
													className="text-[9px] text-destructive hover:underline shrink-0"
													onClick={() =>
														editor.media.cancelProxyGeneration(asset.id)
													}
												>
													Cancelar
												</button>
											)}
											{asset.proxy && !isGenerating && (
												<button
													type="button"
													className="text-[9px] text-destructive hover:underline shrink-0"
													onClick={() => handleDelete(asset.id)}
												>
													Excluir
												</button>
											)}
										</div>
									);
								})}
							</div>
						</div>
					)}

					{highResAssets.length === 0 && (
						<p className="text-[10px] text-muted-foreground">
							Nenhum vídeo em alta resolução (&gt;1080p) neste projeto. A
							edição por proxy será aplicada às próximas importações.
						</p>
					)}
				</>
			)}
		</div>
	);
}
