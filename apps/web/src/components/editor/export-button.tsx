"use client";

import { useEffect, useState } from "react";
import { TransitionTopIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/utils/ui";
import { getExportMimeType, getExportFileExtension, downloadBlob } from "@/lib/export";
import { ExportDone } from "@/components/editor/export-done";
import { Check, Copy, Download, RotateCcw } from "lucide-react";
import {
	EXPORT_FORMAT_VALUES,
	EXPORT_QUALITY_VALUES,
	type ExportFormat,
	type ExportQuality,
} from "@/types/export";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/editor/panels/properties/section";
import { useEditor } from "@/hooks/use-editor";
import { DEFAULT_EXPORT_OPTIONS, EXPORT_PRESETS } from "@/constants/export-constants";

function isExportFormat(value: string): value is ExportFormat {
	return EXPORT_FORMAT_VALUES.some((formatValue) => formatValue === value);
}

function isExportQuality(value: string): value is ExportQuality {
	return EXPORT_QUALITY_VALUES.some((qualityValue) => qualityValue === value);
}

export function ExportButton() {
	const [isExportPopoverOpen, setIsExportPopoverOpen] = useState(false);
	const editor = useEditor();

	const hasProject = !!editor.project.getActiveOrNull();

	const handlePopoverOpenChange = ({ open }: { open: boolean }) => {
		if (!open) {
			editor.project.cancelExport();
			editor.project.clearExportState();
		}
		setIsExportPopoverOpen(open);
	};

	return (
		<Popover open={isExportPopoverOpen} onOpenChange={(open) => handlePopoverOpenChange({ open })}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex items-center gap-1.5 rounded-md bg-[#38BDF8] px-[0.12rem] py-[0.12rem] text-white",
						hasProject ? "cursor-pointer" : "cursor-not-allowed opacity-50",
					)}
					onClick={hasProject ? () => setIsExportPopoverOpen(true) : undefined}
					disabled={!hasProject}
					onKeyDown={(event) => {
						if (hasProject && (event.key === "Enter" || event.key === " ")) {
							event.preventDefault();
							setIsExportPopoverOpen(true);
						}
					}}
				>
					<div className="relative flex items-center gap-1.5 rounded-[0.6rem] bg-linear-270 from-[#2567EC] to-[#37B6F7] px-4 py-1 shadow-[0_1px_3px_0px_rgba(0,0,0,0.65)]">
						<HugeiconsIcon icon={TransitionTopIcon} className="z-50 size-4" />
						<span className="z-50 text-[0.875rem]">Exportar</span>
						<div className="absolute top-0 left-0 z-10 flex size-full items-center justify-center rounded-[0.6rem] bg-linear-to-t from-white/0 to-white/50">
							<div className="absolute top-[0.08rem] z-50 h-[calc(100%-2px)] w-[calc(100%-2px)] rounded-[0.6rem] bg-linear-270 from-[#2567EC] to-[#37B6F7]"></div>
						</div>
					</div>
				</button>
			</PopoverTrigger>
			{hasProject && (
				<ExportPopover
					isOpen={isExportPopoverOpen}
					onOpenChange={setIsExportPopoverOpen}
				/>
			)}
		</Popover>
	);
}

function ExportPopover({
	isOpen,
	onOpenChange,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const editor = useEditor();
	const activeProject = editor.project.getActive();
	const { isExporting, progress, result: exportResult } =
		editor.project.getExportState();
	const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
	const [format, setFormat] = useState<ExportFormat>(
		DEFAULT_EXPORT_OPTIONS.format,
	);
	const [quality, setQuality] = useState<ExportQuality>(
		DEFAULT_EXPORT_OPTIONS.quality,
	);
	const [shouldIncludeAudio, setShouldIncludeAudio] = useState<boolean>(
		DEFAULT_EXPORT_OPTIONS.includeAudio ?? true,
	);
	const [shouldIncludeWatermark, setShouldIncludeWatermark] = useState(true);
	// The finished file stays here after the download, for "Enviar ao TikTok"
	const [completedExport, setCompletedExport] = useState<{
		video: Blob;
		filename: string;
	} | null>(null);
	const [isSendingToTikTok, setIsSendingToTikTok] = useState(false);

	useEffect(() => {
		if (isOpen) return;
		setCompletedExport(null);
		setIsSendingToTikTok(false);
	}, [isOpen]);

	const handlePresetSelect = (presetId: string) => {
		const preset = EXPORT_PRESETS.find((p) => p.id === presetId);
		if (!preset) return;
		setSelectedPresetId(presetId);
		if (isExportFormat(preset.options.format)) setFormat(preset.options.format);
		if (isExportQuality(preset.options.quality)) setQuality(preset.options.quality);
		setShouldIncludeAudio(preset.options.includeAudio ?? true);
	};

	const selectedPreset = EXPORT_PRESETS.find((p) => p.id === selectedPresetId);

	const handleExport = async () => {
		if (!activeProject) return;

		const result = await editor.project.export({
			options: {
			format,
			quality,
			fps: activeProject.settings.fps,
			includeAudio: shouldIncludeAudio,
			includeWatermark: shouldIncludeWatermark,
			},
		});

		if (result.cancelled) {
			editor.project.clearExportState();
			return;
		}

		if (result.success && result.buffer) {
			const video = new Blob([result.buffer], {
				type: getExportMimeType({ format }),
			});
			const filename = `${activeProject.metadata.name}${getExportFileExtension({ format })}`;
			downloadBlob({ blob: video, filename });

			editor.project.clearExportState();
			setCompletedExport({ video, filename });
		}
	};

	// An inbox upload dies with the popover, so outside clicks don't close it then
	const keepOpenWhileSending = (event: Event) => {
		if (isSendingToTikTok) event.preventDefault();
	};

	if (completedExport) {
		return (
			<PopoverContent
				className="bg-background mr-4 flex w-80 flex-col p-0"
				onInteractOutside={keepOpenWhileSending}
				onEscapeKeyDown={keepOpenWhileSending}
			>
				<ExportDone
					video={completedExport.video}
					filename={completedExport.filename}
					canvasSize={activeProject.settings.canvasSize}
					onDownloadAgain={() =>
						downloadBlob({
							blob: completedExport.video,
							filename: completedExport.filename,
						})
					}
					onClose={() => onOpenChange(false)}
					onBusyChange={setIsSendingToTikTok}
				/>
			</PopoverContent>
		);
	}

	const handleCancel = () => {
		editor.project.cancelExport();
	};

	return (
		<PopoverContent className="bg-background mr-4 flex w-80 flex-col p-0">
			{exportResult && !exportResult.success ? (
				<ExportError
					error={exportResult.error || "Ocorreu um erro desconhecido"}
					onRetry={handleExport}
				/>
			) : (
				<>
					<div className="flex items-center justify-between p-3 border-b">
						<h3 className="font-medium text-sm">
							{isExporting ? "Exportando projeto" : "Exportar projeto"}
						</h3>
					</div>

					<div className="flex flex-col gap-4">
						{!isExporting && (
							<>
								{/* Platform presets */}
								<div className="px-3 pt-3 pb-0">
									<p className="text-xs font-medium text-muted-foreground mb-2">
										Exportar para
									</p>
									<div className="flex flex-wrap gap-1.5">
										{EXPORT_PRESETS.filter((p) => p.id !== "custom").map((preset) => (
											<button
												key={preset.id}
												type="button"
												className={cn(
													"rounded-md px-2.5 py-1 text-[11px] border transition-colors",
													selectedPresetId === preset.id
														? "border-primary bg-primary/10 text-primary"
														: "border-border hover:bg-accent text-muted-foreground",
												)}
												onClick={() => handlePresetSelect(preset.id)}
											>
												{preset.name}
											</button>
										))}
									</div>
									{selectedPreset?.tip && (
										<p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
											{selectedPreset.tip}
										</p>
									)}
								</div>

								<div className="flex flex-col">
									<Section collapsible defaultOpen={false} showTopBorder={false}>
										<SectionHeader>
											<SectionTitle>Formato</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<RadioGroup
												value={format}
												onValueChange={(value) => {
													if (isExportFormat(value)) {
														setFormat(value);
													}
												}}
											>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="mp4" id="mp4" />
													<Label htmlFor="mp4">
														MP4 (H.264) - Melhor compatibilidade
													</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="webm" id="webm" />
													<Label htmlFor="webm">
														WebM (VP9) - Menor tamanho de arquivo
													</Label>
												</div>
											</RadioGroup>
										</SectionContent>
									</Section>

									<Section collapsible defaultOpen={false}>
										<SectionHeader>
											<SectionTitle>Qualidade</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<RadioGroup
												value={quality}
												onValueChange={(value) => {
													if (isExportQuality(value)) {
														setQuality(value);
													}
												}}
											>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="low" id="low" />
													<Label htmlFor="low">Baixa - Menor tamanho de arquivo</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="medium" id="medium" />
													<Label htmlFor="medium">Média - Equilibrada</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="high" id="high" />
													<Label htmlFor="high">Alta - Recomendada</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="very_high" id="very_high" />
													<Label htmlFor="very_high">
														Muito alta - Maior tamanho de arquivo
													</Label>
												</div>
											</RadioGroup>
										</SectionContent>
									</Section>

									<Section collapsible defaultOpen={false}>
										<SectionHeader>
											<SectionTitle>Áudio</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<div className="flex items-center space-x-2">
												<Checkbox
													id="include-audio"
								checked={shouldIncludeAudio}
												onCheckedChange={(checked) =>
													setShouldIncludeAudio(!!checked)
												}
												/>
												<Label htmlFor="include-audio">
													Incluir áudio na exportação
												</Label>
											</div>
										</SectionContent>
									</Section>

									<Section showTopBorder>
										<SectionHeader>
											<SectionTitle>Marca d'água</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<div className="flex items-start space-x-2">
												<Checkbox
													id="include-watermark"
													checked={shouldIncludeWatermark}
													onCheckedChange={(checked) =>
														setShouldIncludeWatermark(!!checked)
													}
												/>
												<div className="flex flex-col gap-0.5">
													<Label htmlFor="include-watermark">
														Incluir marca d'água do OpenCut AI
													</Label>
													<p className="text-[10px] text-muted-foreground leading-relaxed">
														Este é um software de código aberto. Incluir a marca d'água ajuda a divulgar e apoiar o projeto.
													</p>
												</div>
											</div>
										</SectionContent>
									</Section>
								</div>

								<div className="p-3 pt-0">
									<Button onClick={handleExport} className="w-full gap-2">
										<Download className="size-4" />
										Exportar
									</Button>
								</div>
							</>
						)}

						{isExporting && (
							<div className="space-y-4 p-3">
							<div className="flex flex-col gap-2">
								<div className="flex items-center justify-between text-center">
									<p className="text-muted-foreground text-sm">
										{Math.round(progress * 100)}%
									</p>
									<p className="text-muted-foreground text-sm">100%</p>
								</div>
								<Progress value={progress * 100} className="w-full" />
							</div>

								<Button
									variant="outline"
									className="w-full rounded-md"
									onClick={handleCancel}
								>
									Cancelar
								</Button>
							</div>
						)}
					</div>
				</>
			)}
		</PopoverContent>
	);
}

function ExportError({
	error,
	onRetry,
}: {
	error: string;
	onRetry: () => void;
}) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(error);
		setCopied(true);
		setTimeout(() => setCopied(false), 1000);
	};

	return (
		<div className="space-y-4 p-3">
			<div className="flex flex-col gap-1.5">
				<p className="text-destructive text-sm font-medium">Falha na exportação</p>
				<p className="text-muted-foreground text-xs">{error}</p>
			</div>

			<div className="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					className="h-8 flex-1 text-xs"
					onClick={handleCopy}
				>
					{copied ? <Check className="text-constructive" /> : <Copy />}
					Copiar
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="h-8 flex-1 text-xs"
					onClick={onRetry}
				>
					<RotateCcw />
					Tentar novamente
				</Button>
			</div>
		</div>
	);
}
