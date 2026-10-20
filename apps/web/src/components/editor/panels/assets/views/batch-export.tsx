"use client";

import { useState, useCallback } from "react";
import { cn } from "@/utils/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HugeiconsIcon } from "@hugeicons/react";
import { Download04Icon, Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import {
	PLATFORM_PRESETS,
	createQueueItem,
	getPresetExportFilename,
	getPresetExportOptions,
	runExportQueue,
	type ExportQueueItem,
} from "@/lib/export-presets";
import { downloadBuffer, getExportMimeType } from "@/lib/export";
import { useEditor } from "@/hooks/use-editor";
import { toast } from "sonner";

export function BatchExportPanel({ className }: { className?: string }) {
	const editor = useEditor();
	const [queue, setQueue] = useState<ExportQueueItem[]>([]);
	const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());
	const [isRunning, setIsRunning] = useState(false);
	const { isExporting, progress: exportProgress } = editor.project.getExportState();
	const queuedCount = queue.filter((q) => q.status === "queued").length;

	const togglePreset = useCallback((id: string) => {
		setSelectedPresets((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const addToQueue = useCallback(() => {
		const items = Array.from(selectedPresets)
			.map((id) => PLATFORM_PRESETS.find((p) => p.id === id))
			.filter(Boolean)
			.map((preset) => createQueueItem(preset!));

		if (items.length === 0) {
			toast.error("Selecione ao menos um predefinido de exportação");
			return;
		}

		setQueue((prev) => [...prev, ...items]);
		setSelectedPresets(new Set());
		toast.success(`${items.length} exportações adicionadas à fila`);
	}, [selectedPresets]);

	const handleExportAll = useCallback(async () => {
		const project = editor.project.getActiveOrNull();
		const queued = queue.filter((item) => item.status === "queued");
		if (!project || queued.length === 0 || isRunning) return;

		setIsRunning(true);
		try {
			const { completed, failed } = await runExportQueue({
				items: queued,
				exportItem: async ({ item }) => {
					try {
						return await editor.project.export({
							options: getPresetExportOptions({ preset: item.preset }),
						});
					} finally {
						editor.project.clearExportState();
					}
				},
				saveResult: ({ item, buffer }) =>
					downloadBuffer({
						buffer,
						filename: getPresetExportFilename({
							projectName: project.metadata.name,
							preset: item.preset,
						}),
						mimeType: getExportMimeType({ format: item.preset.format }),
					}),
				onItemChange: ({ id, changes }) =>
					setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...changes } : q))),
			});

			if (failed > 0) {
				toast.error(`${failed} de ${completed + failed} exportações falharam`);
			} else {
				toast.success(
					completed === 1 ? "1 arquivo exportado" : `${completed} arquivos exportados`,
				);
			}
		} finally {
			setIsRunning(false);
		}
	}, [queue, editor, isRunning]);

	const removeFromQueue = useCallback((id: string) => {
		setQueue((prev) => prev.filter((q) => q.id !== id));
	}, []);

	return (
		<div className={cn("flex flex-col h-full", className)}>
			<div className="px-4 py-3 border-b space-y-2">
				<div className="flex items-center gap-2">
					<HugeiconsIcon icon={Download04Icon} className="size-4 text-primary" />
					<span className="text-xs font-medium">Exportação em Lote</span>
					{queue.length > 0 && (
						<Badge variant="secondary" className="text-[8px] px-1 py-0">
							{queue.length}
						</Badge>
					)}
				</div>
			</div>

			<ScrollArea className="flex-1 min-h-0">
				<div className="px-4 py-3 space-y-3">
					<div className="space-y-1.5">
						<span className="text-[10px] font-medium text-muted-foreground">Predefinições</span>
						<div className="grid grid-cols-2 gap-1">
							{PLATFORM_PRESETS.map((preset) => (
								<button
									key={preset.id}
									type="button"
									className={cn(
										"rounded border p-1.5 text-left transition-colors",
										selectedPresets.has(preset.id) ? "border-primary bg-primary/5" : "hover:bg-accent/50",
									)}
									onClick={() => togglePreset(preset.id)}
								>
									<span className="text-[10px] font-medium block">{preset.name}</span>
									<span className="text-[8px] text-muted-foreground">{preset.description}</span>
								</button>
							))}
						</div>
						<Button size="sm" variant="outline" className="w-full h-7 text-[10px]" onClick={addToQueue}>
							<HugeiconsIcon icon={Add01Icon} className="size-3 mr-1" />
							Adicionar selecionados à fila
						</Button>
					</div>

					{queue.length > 0 && (
						<div className="space-y-1.5">
							<span className="text-[10px] font-medium text-muted-foreground">Fila</span>
							{queue.map((item) => (
								<div key={item.id} className="rounded border p-2 flex items-center gap-2">
									<div className="flex-1 min-w-0">
										<span className="text-[10px] font-medium block truncate">
											{item.preset.name}
										</span>
										<span className={cn(
											"text-[8px]",
											item.status === "completed" && "text-green-500",
											item.status === "error" && "text-destructive",
											item.status === "exporting" && "text-primary",
											item.status === "queued" && "text-muted-foreground",
										)}>
											{item.status === "queued" && "Na fila"}
											{item.status === "exporting" &&
												`Exportando ${Math.round(exportProgress * 100)}%`}
											{item.status === "completed" && "Concluído"}
											{item.status === "error" && item.error}
										</span>
									</div>
									{!isRunning && item.status !== "exporting" && (
										<button
											type="button"
											onClick={() => removeFromQueue(item.id)}
											className="text-muted-foreground hover:text-destructive"
										>
											<HugeiconsIcon icon={Cancel01Icon} className="size-3" />
										</button>
									)}
								</div>
							))}
							<Button
								size="sm"
								className="w-full"
								onClick={handleExportAll}
								disabled={isRunning || isExporting || queuedCount === 0}
							>
								Exportar tudo ({queuedCount})
							</Button>
						</div>
					)}
				</div>
			</ScrollArea>
		</div>
	);
}
