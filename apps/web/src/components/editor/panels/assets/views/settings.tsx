"use client";

import { useCallback, useEffect, useState } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-view";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { FPS_PRESETS } from "@/constants/project-constants";
import { useEditor } from "@/hooks/use-editor";
import { useEditorStore } from "@/stores/editor-store";
import { dimensionToAspectRatio } from "@/utils/geometry";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/editor/panels/properties/section";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/ui";
import { aiClient } from "@/lib/ai-client";
import type { TurboQuantStatus } from "@/types/ai";
import { toast } from "sonner";
import { FactCheckView } from "./factcheck";
import type { ProxyResolution } from "@/services/storage/types";

const ORIGINAL_PRESET_VALUE = "original";

export function findPresetIndexByAspectRatio({
	presets,
	targetAspectRatio,
}: {
	presets: Array<{ width: number; height: number }>;
	targetAspectRatio: string;
}) {
	for (let index = 0; index < presets.length; index++) {
		const preset = presets[index];
		const presetAspectRatio = dimensionToAspectRatio({
			width: preset.width,
			height: preset.height,
		});
		if (presetAspectRatio === targetAspectRatio) {
			return index;
		}
	}
	return -1;
}

export function SettingsView() {
	return (
		<PanelView contentClassName="px-0" hideHeader>
			<div className="flex flex-col">
				<Section showTopBorder={false}>
					<SectionContent>
						<ProjectInfoContent />
					</SectionContent>
				</Section>
				<Section>
					<SectionHeader>
						<SectionTitle>Edição por proxy</SectionTitle>
					</SectionHeader>
					<SectionContent>
						<ProxyEditingSection />
					</SectionContent>
				</Section>
				<Section>
					<SectionHeader>
						<SectionTitle>Otimização de IA</SectionTitle>
					</SectionHeader>
					<SectionContent>
						<AIOptimizationSection />
					</SectionContent>
				</Section>
				<Section>
					<SectionHeader>
						<SectionTitle>Chaves de API</SectionTitle>
					</SectionHeader>
					<SectionContent>
						<APIKeysSection />
					</SectionContent>
				</Section>
				{/* Fact Check renders its own PanelView header */}
				<FactCheckView />
				</div>
		</PanelView>
	);
}

function ProjectInfoContent() {
	const editor = useEditor();
	const activeProject = editor.project.getActive();
	const { canvasPresets } = useEditorStore();

	const currentCanvasSize = activeProject.settings.canvasSize;
	const currentAspectRatio = dimensionToAspectRatio(currentCanvasSize);
	const originalCanvasSize = activeProject.settings.originalCanvasSize ?? null;
	const presetIndex = findPresetIndexByAspectRatio({
		presets: canvasPresets,
		targetAspectRatio: currentAspectRatio,
	});
	const selectedPresetValue =
		presetIndex !== -1 ? presetIndex.toString() : ORIGINAL_PRESET_VALUE;

	const handleAspectRatioChange = ({ value }: { value: string }) => {
		if (value === ORIGINAL_PRESET_VALUE) {
			const canvasSize = originalCanvasSize ?? currentCanvasSize;
			editor.project.updateSettings({
				settings: { canvasSize },
			});
			return;
		}
		const index = parseInt(value, 10);
		const preset = canvasPresets[index];
		if (preset) {
			editor.project.updateSettings({ settings: { canvasSize: preset } });
		}
	};

	const handleFpsChange = ({ value }: { value: string }) => {
		const fps = parseFloat(value);
		editor.project.updateSettings({ settings: { fps } });
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<Label>Nome</Label>
				<span className="text-sm leading-none">
					{activeProject.metadata.name}
				</span>
			</div>
			<div className="flex flex-col gap-2">
				<Label>Proporção</Label>
				<Select
					value={selectedPresetValue}
					onValueChange={(value) => handleAspectRatioChange({ value })}
				>
					<SelectTrigger className="w-fit">
						<SelectValue placeholder="Selecione uma proporção" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ORIGINAL_PRESET_VALUE}>Original</SelectItem>
						{canvasPresets.map((preset, index) => {
							const label = dimensionToAspectRatio({
								width: preset.width,
								height: preset.height,
							});
							return (
								<SelectItem key={label} value={index.toString()}>
									{label}
								</SelectItem>
							);
						})}
					</SelectContent>
				</Select>
			</div>
			<div className="flex flex-col gap-2">
				<Label>Taxa de quadros</Label>
				<Select
					value={activeProject.settings.fps.toString()}
					onValueChange={(value) => handleFpsChange({ value })}
				>
					<SelectTrigger className="w-fit">
						<SelectValue placeholder="Selecione uma taxa de quadros" />
					</SelectTrigger>
					<SelectContent>
						{FPS_PRESETS.map((preset) => (
							<SelectItem key={preset.value} value={preset.value}>
								{preset.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}

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

function ProxyEditingSection() {
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

// ----- AI Optimization Section -----

import {
	KV_CACHE_CONFIGS,
	MODEL_TIERS,
	MEMORY_BUDGETS,
} from "@/constants/turboquant-constants";

const CONFIG_STORAGE_KEY = "opencut-ai-config";

function loadSavedConfig(): Record<string, string | number> {
	try {
		const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch { return {}; }
}

function saveConfig(updates: Record<string, string | number>) {
	try {
		const existing = loadSavedConfig();
		localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ ...existing, ...updates }));
	} catch { /* ignore */ }
}

/** Merge user's saved preferences over backend status so selections persist across navigation. */
function mergeWithSavedConfig(data: TurboQuantStatus): TurboQuantStatus {
	const saved = loadSavedConfig();
	if (Object.keys(saved).length === 0) return data;
	const merged = { ...data };
	if ("AI_MODEL_TIER" in saved) merged.model_tier = String(saved.AI_MODEL_TIER);
	if ("KV_CACHE_BITS" in saved) merged.kv_cache_bits = Number(saved.KV_CACHE_BITS);
	if ("AI_MEMORY_BUDGET" in saved) merged.memory_budget = String(saved.AI_MEMORY_BUDGET);
	if ("AI_COMPUTE_MODE" in saved) {
		const raw = String(saved.AI_COMPUTE_MODE);
		if (raw === "auto" || raw === "cpu" || raw === "cuda") {
			merged.compute_mode = raw;
		}
	}
	return merged;
}

function AIOptimizationSection() {
	const [status, setStatus] = useState<TurboQuantStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchStatus = useCallback(() => {
		setLoading(true);
		aiClient
			.turboquantStatus()
			.then((data) => { setStatus(mergeWithSavedConfig(data)); setError(null); })
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
			.finally(() => setLoading(false));
	}, []);

	useEffect(() => { fetchStatus(); }, [fetchStatus]);

	// On mount, push any saved config to the backend
	useEffect(() => {
		const saved = loadSavedConfig();
		if (Object.keys(saved).length === 0) return;
		aiClient.updateConfig(saved)
			.then(() => fetchStatus())
			.catch(() => { /* backend not ready yet, config stays in localStorage */ });
	}, [fetchStatus]);

	const handleConfigUpdate = useCallback((updates: Record<string, string | number>, label: string) => {
		// 1. Save to localStorage (persists across navigation)
		saveConfig(updates);

		// 2. Update UI immediately
		setStatus((prev) => {
			if (!prev) return prev;
			const next = { ...prev };
			if ("AI_MODEL_TIER" in updates) next.model_tier = String(updates.AI_MODEL_TIER);
			if ("KV_CACHE_BITS" in updates) next.kv_cache_bits = Number(updates.KV_CACHE_BITS);
			if ("AI_MEMORY_BUDGET" in updates) next.memory_budget = String(updates.AI_MEMORY_BUDGET);
			if ("AI_COMPUTE_MODE" in updates) {
				const raw = String(updates.AI_COMPUTE_MODE);
				if (raw === "auto" || raw === "cpu" || raw === "cuda") {
					next.compute_mode = raw;
				}
			}
			return next;
		});
		toast.success(`Configuração aplicada: ${label}`);

		// 3. Push to backend in background
		aiClient.updateConfig(updates)
			.then(() => fetchStatus())
			.catch(() => { /* stays in localStorage for next sync */ });
	}, [fetchStatus]);

	if (loading) {
		return <p className="text-[10px] text-muted-foreground">Carregando status da otimização...</p>;
	}

	if (error) {
		return (
			<p className="text-[10px] text-muted-foreground">
				Backend de IA inacessível. Inicie o backend para configurar a otimização.
			</p>
		);
	}

	if (!status) return null;

	const hw = status.hardware;
	const stack = status.stack_memory_estimate;
	const savingsPercent = stack.total_without_turboquant_mb > 0
		? Math.round((stack.savings_mb / stack.total_without_turboquant_mb) * 100)
		: 0;

	// Compute recommendations based on system RAM
	const ramGb = Math.round(hw.ram_total_mb / 1024);
	const activeTier = status.model_tier === "auto" ? status.recommended_tier : status.model_tier;
	const recommendedTier = status.recommended_tier;
	const recommendedKvBits = ramGb <= 8 ? 3 : 4;
	const recommendedBudget = ramGb >= 32 ? "32GB" : ramGb >= 16 ? "16GB" : ramGb >= 8 ? "8GB" : "4GB";
	// Resolve "auto" budget to the actual best match
	const activeBudget = status.memory_budget === "auto" ? recommendedBudget : status.memory_budget;

	return (
		<div className="flex flex-col gap-3">
			{/* Current status row */}
			<div className="flex items-center justify-between rounded-md border px-2.5 py-1.5 bg-muted/20">
				<div className="flex items-center gap-1.5">
					<span
						className={cn(
							"size-1.5 rounded-full shrink-0",
							status.inference_service.available ? "bg-green-500" : "bg-muted-foreground/30",
						)}
					/>
					<span className="text-[10px] font-medium">
						{status.recommended_model.name}
					</span>
				</div>
				<div className="flex items-center gap-1.5">
					<Badge variant="secondary" className="text-[8px] px-1 py-0">
						{Math.round(hw.ram_available_mb / 1024)} / {Math.round(hw.ram_total_mb / 1024)} GB
					</Badge>
					{hw.gpu_available && (
						<Badge variant="secondary" className="text-[8px] px-1 py-0">
							{hw.gpu_name || "GPU"}
						</Badge>
					)}
				</div>
			</div>

			{/* Memory savings — reflects the EFFECTIVE backend bits (GPU: 2-3, CPU: 3)
			    and uses the live measured compression ratio when available. */}
			{savingsPercent > 0 && (
				<div className="flex flex-col gap-1 rounded-md border border-green-500/20 bg-green-500/5 px-2.5 py-1.5">
					<div className="flex items-center justify-between">
						<span className="text-[10px]">
							<span className="font-mono font-medium">{(stack.total_with_turboquant_mb / 1024).toFixed(1)} GB</span>
							<span className="text-muted-foreground line-through ml-1.5 font-mono text-[9px]">
								{(stack.total_without_turboquant_mb / 1024).toFixed(1)} GB
							</span>
						</span>
						<Badge variant="outline" className="text-[8px] px-1.5 py-0 text-green-500 border-green-500/30">
							{savingsPercent}% de economia
						</Badge>
					</div>
					<div className="flex items-center justify-between text-[9px] text-muted-foreground">
						<span>
							{stack.kv_compression_ratio && `${stack.kv_compression_ratio.toFixed(1)}x de compressão KV`}
							{status.kv_cache_bits_effective && (
								<span className="ml-1">
									({status.kv_cache_bits_effective}-bit on {status.inference_service.compute_mode === "cuda" ? "GPU" : "CPU"})
								</span>
							)}
						</span>
						{stack.source === "measured" ? (
							<span className="text-green-500/80">ao vivo</span>
						) : (
							<span>estimado</span>
						)}
					</div>
					{status.kv_cache_bits_effective !== undefined &&
						status.kv_cache_bits_requested !== undefined &&
						status.kv_cache_bits_effective !== status.kv_cache_bits_requested && (
							<div className="text-[9px] text-amber-500">
								Você selecionou {status.kv_cache_bits_requested}-bit, mas o back-end de {status.inference_service.compute_mode === "cuda" ? "GPU" : "CPU"} limita a {status.kv_cache_bits_effective}-bit.
							</div>
						)}
				</div>
			)}

			{/* Performance tier selector */}
			<div className="flex flex-col gap-1.5">
				<Label className="text-xs">Nível de desempenho</Label>
				<div className="flex flex-col gap-1">
					{MODEL_TIERS.map((tier) => {
						const isActive = activeTier === tier.name;
						const isRecommended = recommendedTier === tier.name;
						return (
							<button
								key={tier.name}
								type="button"

								onClick={() => {
									if (isActive) return;
									handleConfigUpdate({ AI_MODEL_TIER: tier.name }, `Nível ${tier.label}`);
								}}
								className={cn(
									"flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left transition-colors",
									isActive
										? "border-primary/40 bg-primary/5"
										: isRecommended
											? "border-amber-500/30 hover:bg-amber-500/5 cursor-pointer"
											: "border-border hover:bg-accent cursor-pointer",
								)}
							>
								<div className="flex items-center gap-1.5">
									{isActive ? (
										<svg aria-hidden="true" className="size-3 text-primary shrink-0" viewBox="0 0 16 16" fill="none">
											<path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
										</svg>
									) : (
										<span className="size-3 shrink-0" />
									)}
									<span className="text-[10px] font-medium">{tier.label}</span>
									<span className="text-[9px] text-muted-foreground">{tier.ramRange}</span>
									{isRecommended && (
										<Badge variant="outline" className={cn(
											"text-[7px] px-1 py-0",
											isActive ? "text-primary border-primary/40" : "text-amber-500 border-amber-500/40",
										)}>
											Ideal para {ramGb} GB
										</Badge>
									)}
								</div>
								<Badge
									variant={isActive ? "default" : "secondary"}
									className="text-[8px] px-1 py-0"
								>
									{tier.quality}
								</Badge>
							</button>
						);
					})}
				</div>
			</div>

			{/* KV Cache compression selector */}
			<div className="flex flex-col gap-1.5">
				<Label className="text-xs">Compressão de Cache KV</Label>
				<p className="text-[9px] text-muted-foreground">
					Menos bits = mais memória economizada, com uma pequena perda de precisão.
				</p>
				<div className="flex flex-col gap-1">
					{KV_CACHE_CONFIGS.map((config) => {
						const isActive = status.kv_cache_bits === config.bits;
						const isRecommended = recommendedKvBits === config.bits;
						return (
							<button
								key={config.bits}
								type="button"

								onClick={() => {
									if (isActive) return;
									handleConfigUpdate({ KV_CACHE_BITS: config.bits }, `Compressão de ${config.bits} bits`);
								}}
								className={cn(
									"flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left transition-colors",
									isActive
										? "border-primary/40 bg-primary/5"
										: isRecommended
											? "border-amber-500/30 hover:bg-amber-500/5 cursor-pointer"
											: "border-border hover:bg-accent cursor-pointer",
								)}
							>
								<div className="flex items-center gap-1.5">
									{isActive ? (
										<svg aria-hidden="true" className="size-3 text-primary shrink-0" viewBox="0 0 16 16" fill="none">
											<path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
										</svg>
									) : (
										<span className="size-3 shrink-0" />
									)}
									<span className="text-[10px] font-medium">{config.bits}-bit</span>
									<span className="text-[9px] text-muted-foreground">
										{config.compressionRatio}x de compressão
									</span>
									{isRecommended && (
										<Badge variant="outline" className={cn(
											"text-[7px] px-1 py-0",
											isActive ? "text-primary border-primary/40" : "text-amber-500 border-amber-500/40",
										)}>
											Recomendado
										</Badge>
									)}
								</div>
								<Badge
									variant="secondary"
									className={cn(
										"text-[8px] px-1 py-0",
										config.quality === "Near-lossless" && "text-green-500",
										config.quality === "Minor degradation" && "text-yellow-500",
										config.quality === "Noticeable loss" && "text-red-500",
									)}
								>
									{config.quality}
								</Badge>
							</button>
						);
					})}
				</div>
			</div>

			{/* Memory budget selector */}
			<div className="flex flex-col gap-1.5">
				<Label className="text-xs">Orçamento de memória</Label>
				<div className="flex flex-col gap-1">
					{MEMORY_BUDGETS.filter((b) => b.value !== "auto").map((b) => {
						const isActive = activeBudget === b.value;
						const isRecommended = b.value === recommendedBudget;
						return (
							<button
								key={b.value}
								type="button"

								onClick={() => {
									if (isActive) return;
									handleConfigUpdate({ AI_MEMORY_BUDGET: b.value }, `Orçamento de ${b.label}`);
								}}
								className={cn(
									"flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left transition-colors",
									isActive
										? "border-primary/40 bg-primary/5"
										: isRecommended
											? "border-amber-500/30 hover:bg-amber-500/5 cursor-pointer"
											: "border-border hover:bg-accent cursor-pointer",
								)}
							>
								<div className="flex items-center gap-1.5">
									{isActive ? (
										<svg aria-hidden="true" className="size-3 text-primary shrink-0" viewBox="0 0 16 16" fill="none">
											<path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
										</svg>
									) : (
										<span className="size-3 shrink-0" />
									)}
									<span className="text-[10px] font-medium">{b.label}</span>
									{isRecommended && (
										<Badge variant="outline" className={cn(
											"text-[7px] px-1 py-0",
											isActive ? "text-primary border-primary/40" : "text-amber-500 border-amber-500/40",
										)}>
											Melhor opção
										</Badge>
									)}
								</div>
								<span className="text-[9px] text-muted-foreground">{b.description}</span>
							</button>
						);
					})}
				</div>
			</div>

			{/* Compute Mode selector (CPU / GPU / Auto) */}
			<ComputeModeSelector
				status={status}
				onSelect={(mode, label) =>
					handleConfigUpdate({ AI_COMPUTE_MODE: mode }, label)
				}
			/>
		</div>
	);
}

// ----- Compute Mode Selector -----

const COMPUTE_MODES: Array<{
	value: "auto" | "cpu" | "cuda";
	label: string;
	description: string;
}> = [
	{
		value: "auto",
		label: "Automático",
		description: "Detecta o melhor dispositivo (CUDA → MPS → CPU).",
	},
	{
		value: "cpu",
		label: "CPU",
		description: "Força a inferência em CPU. Funciona em qualquer lugar, porém mais lenta.",
	},
	{
		value: "cuda",
		label: "GPU (CUDA)",
		description: "Força o uso de GPU NVIDIA. Requer uma máquina compatível com CUDA.",
	},
];

function ComputeModeSelector({
	status,
	onSelect,
}: {
	status: TurboQuantStatus;
	onSelect: (mode: "auto" | "cpu" | "cuda", label: string) => void;
}) {
	const active = status.compute_mode ?? "auto";
	const gpuAvailable = status.hardware.gpu_available;
	const runningOn = status.inference_service.compute_mode ?? "unknown";
	const engineAvailable = status.inference_service.turboquant_engine_available;
	const ratio = status.inference_service.compression_ratio_last;

	return (
		<div className="flex flex-col gap-1.5">
			<Label className="text-xs">Modo de computação</Label>
			<p className="text-[9px] text-muted-foreground">
				Escolha onde o TurboQuant será executado. O modo Automático escolhe o dispositivo mais rápido da sua máquina.
			</p>
			<div className="flex flex-col gap-1">
				{COMPUTE_MODES.map((mode) => {
					const isActive = active === mode.value;
					const disabled = mode.value === "cuda" && !gpuAvailable;
					return (
						<button
							key={mode.value}
							type="button"
							disabled={disabled}
							onClick={() => {
								if (isActive || disabled) return;
								onSelect(mode.value, `Computação: ${mode.label}`);
							}}
							title={
								disabled
									? "Nenhuma GPU detectada nesta máquina"
									: mode.description
							}
							className={cn(
								"flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left transition-colors",
								isActive
									? "border-primary/40 bg-primary/5"
									: disabled
										? "border-border opacity-50 cursor-not-allowed"
										: "border-border hover:bg-accent cursor-pointer",
							)}
						>
							<div className="flex items-center gap-1.5">
								{isActive ? (
									<svg aria-hidden="true" className="size-3 text-primary shrink-0" viewBox="0 0 16 16" fill="none">
										<path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
									</svg>
								) : (
									<span className="size-3 shrink-0" />
								)}
								<span className="text-[10px] font-medium">{mode.label}</span>
								{mode.value === "cuda" && gpuAvailable && status.hardware.gpu_name && (
									<span className="text-[9px] text-muted-foreground">
										{status.hardware.gpu_name}
									</span>
								)}
							</div>
							<span className="text-[9px] text-muted-foreground">{mode.description}</span>
						</button>
					);
				})}
			</div>
			<div className="flex items-center justify-between px-0.5 pt-0.5">
				<span className="text-[9px] text-muted-foreground">
					Em execução: <span className="font-mono">{runningOn}</span>
					{engineAvailable === false && " (mecanismo indisponível)"}
				</span>
				{typeof ratio === "number" && ratio > 0 && (
					<Badge variant="outline" className="text-[8px] px-1 py-0 text-green-500 border-green-500/30">
						{ratio.toFixed(1)}x de compressão KV
					</Badge>
				)}
			</div>
		</div>
	);
}

// ----- API Keys Section -----

const API_KEY_FIELDS = [
	{
		key: "FREESOUND_CLIENT_ID",
		label: "ID de cliente do Freesound",
		placeholder: "Seu ID de cliente",
		description: "Busca na biblioteca de sons",
		envVar: "FREESOUND_CLIENT_ID",
		envValue: process.env.FREESOUND_CLIENT_ID || "",
		info: "Permite buscar e explorar milhares de sons gratuitos da biblioteca Freesound. Obtenha sua chave em freesound.org/apiv2/apply",
		required: true,
	},
	{
		key: "FREESOUND_API_KEY",
		label: "Chave de API do Freesound",
		placeholder: "Sua chave de API",
		description: "Pré-visualização e download de sons",
		envVar: "FREESOUND_API_KEY",
		envValue: process.env.FREESOUND_API_KEY || "",
		info: "Necessária para pré-visualizar e baixar sons do Freesound. Sem essa chave, o painel de sons não retornará resultados.",
		required: true,
	},
	{
		key: "sarvam",
		label: "Chave de API do Sarvam AI",
		placeholder: "sk_...",
		description: "Transcrição, tradução e TTS para idiomas indianos",
		envVar: "OPENCUTAI_SARVAM_API_KEY",
		// Audit finding H-3: env fallbacks that expose keys to every visitor's
		// browser bundle were removed; server-side keys are configured on the
		// backend, not shipped to the client.
		envValue: "",
		info: "Permite transcrição, tradução e conversão de texto em fala (TTS) para 22 idiomas regionais indianos (hindi, bengali, tâmil, telugu, etc.) via Sarvam AI. Obtenha sua chave em dashboard.sarvam.ai — créditos gratuitos ao se cadastrar.",
		required: false,
	},
	{
		key: "smallest",
		label: "Chave de API do Smallest AI",
		placeholder: "Sua chave do Smallest AI",
		description: "Lightning TTS (15 idiomas, mais de 80 vozes) e Pulse STT (39 idiomas)",
		envVar: "OPENCUTAI_SMALLEST_API_KEY",
		envValue: "",
		info: "Permite conversão de texto em fala com latência ultrabaixa e mais de 80 vozes naturais em 15 idiomas, além de conversão de fala em texto com suporte a 39 idiomas, identificação de locutor e detecção de emoções. Obtenha sua chave em app.smallest.ai.",
		required: false,
	},
	{
		key: "pexels",
		label: "Chave de API do Pexels",
		placeholder: "Sua chave de API do Pexels",
		description: "Fotos de banco de imagens gratuitas para sugestões de B-roll",
		envVar: "PEXELS_API_KEY",
		envValue: process.env.PEXELS_API_KEY || "",
		info: "Permite a busca de fotos de banco de imagens nas sugestões de B-roll. O Pexels oferece fotos gratuitas de alta qualidade, com 200 solicitações por hora. Obtenha sua chave em pexels.com/api — cadastro instantâneo, sem necessidade de pagamento.",
		required: false,
	},
	{
		key: "seedance",
		label: "Chave de API do Seedance (PiAPI)",
		placeholder: "Sua chave PiAPI para o Seedance 2.0",
		description: "Geração de texto em vídeo via Seedance 2.0 (ByteDance)",
		envVar: "OPENCUTAI_SEEDANCE_API_KEY",
		envValue: "",
		info: "Permite gerar vídeos com IA a partir de prompts de texto usando o Seedance 2.0, da ByteDance. Acesso via PiAPI — obtenha sua chave em piapi.ai. Compatível com texto em vídeo nos formatos 16:9, 9:16, 1:1 e outros. Você também pode usar a geração local sem essa chave.",
		required: false,
	},
	{
		key: "replicate",
		label: "Token de API do Replicate",
		placeholder: "r8_...",
		description: "Acesse Runway Gen-3, Pika, Kling, MiniMax, Stable Video e mais de 10 outros modelos",
		envVar: "NEXT_PUBLIC_REPLICATE_API_TOKEN",
		envValue: "",
		info: "Uma única chave de API para mais de 10 modelos de geração de vídeo: Runway Gen-3 Alpha, Pika 1.0, Kling v1.6, MiniMax Video-01, Stable Video Diffusion e outros. Cobrança por uso. Obtenha seu token em replicate.com — $5 em créditos gratuitos ao se cadastrar.",
		required: false,
	},
	{
		key: "stability",
		label: "Chave de API do Stability AI",
		placeholder: "sk-...",
		description: "Stable Video Diffusion e futuros modelos de vídeo da Stability",
		envVar: "NEXT_PUBLIC_STABILITY_API_KEY",
		envValue: "",
		info: "Permite usar o Stable Video Diffusion para animação de imagem em vídeo e geração de texto em vídeo. Obtenha sua chave em platform.stability.ai — créditos gratuitos disponíveis.",
		required: false,
	},
	{
		key: "luma",
		label: "Chave de API do Luma AI",
		placeholder: "Sua chave do Luma AI",
		description: "Dream Machine — movimento realista e controle de câmera",
		envVar: "NEXT_PUBLIC_LUMA_API_KEY",
		envValue: "",
		info: "Permite usar o Luma Dream Machine para gerar vídeos de alta qualidade com movimento de câmera realista. Compatível com texto em vídeo e imagem em vídeo. Obtenha sua chave em lumalabs.ai.",
		required: false,
	},
];

function APIKeysSection() {
	const [keys, setKeys] = useState<Record<string, string>>(() => {
		if (typeof window === "undefined") return {};
		try {
			const stored = localStorage.getItem("opencut-api-keys");
			return stored ? JSON.parse(stored) : {};
		} catch {
			return {};
		}
	});
	const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

	const toggleVisibility = useCallback((key: string) => {
		setVisibleKeys((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	}, []);

	const handleSave = useCallback((key: string, value: string) => {
		setKeys((prev) => {
			const next = { ...prev, [key]: value };
			try {
				localStorage.setItem("opencut-api-keys", JSON.stringify(next));
			} catch {}
			return next;
		});
	}, []);

	const handleClear = useCallback((key: string) => {
		setKeys((prev) => {
			const next = { ...prev };
			delete next[key];
			try {
				localStorage.setItem("opencut-api-keys", JSON.stringify(next));
			} catch {}
			return next;
		});
	}, []);

	return (
		<div className="flex flex-col gap-3">
			<p className="text-[11px] text-muted-foreground leading-relaxed">
				Configure chaves de API para os serviços. As chaves são armazenadas localmente no seu navegador. Você também pode configurá-las no arquivo <code className="text-[10px] font-mono bg-muted px-1 rounded">.env.local</code>.
			</p>

			{API_KEY_FIELDS.map((field) => {
				const localValue = keys[field.key]?.trim() || "";
				const envValue = field.envValue?.trim() || "";
				const effectiveValue = localValue || envValue;
				const hasValue = !!effectiveValue;
				const isFromEnv = !localValue && !!envValue;
				const isVisible = visibleKeys.has(field.key);

				return (
					<div
						key={field.key}
						className={cn(
							"flex flex-col gap-1.5 rounded-lg border p-2.5",
							hasValue ? "border-green-500/20 bg-green-500/5" : field.required ? "border-yellow-500/20 bg-yellow-500/5" : "border-border",
						)}
					>
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-1.5">
								<span
									className={cn(
										"size-1.5 rounded-full shrink-0",
										hasValue ? "bg-green-500" : field.required ? "bg-yellow-500" : "bg-muted-foreground/30",
									)}
								/>
								<Label className="text-[11px]">{field.label}</Label>
								{field.required && !hasValue && (
									<Badge variant="outline" className="text-[8px] px-1 py-0 text-yellow-500 border-yellow-500/30">
										Obrigatório
									</Badge>
								)}
								{isFromEnv && (
									<Badge variant="secondary" className="text-[8px] px-1 py-0">
										Do ambiente
									</Badge>
								)}
							</div>
							<div className="flex items-center gap-1">
								{/* Info popover */}
								<Popover>
									<PopoverTrigger asChild>
										<button
											type="button"
											className="size-4 rounded-full border text-[9px] font-bold text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center"
										>
											i
										</button>
									</PopoverTrigger>
									<PopoverContent side="left" align="start" className="w-64 p-3">
										<p className="text-xs leading-relaxed">{field.info}</p>
										<p className="text-[10px] text-muted-foreground mt-2 font-mono">
											Ambiente: {field.envVar}
										</p>
									</PopoverContent>
								</Popover>
								{hasValue && (
									<>
										<button
											type="button"
											className="text-[9px] text-muted-foreground hover:text-foreground px-1"
											onClick={() => toggleVisibility(field.key)}
										>
											{isVisible ? "Ocultar" : "Mostrar"}
										</button>
										{!isFromEnv && (
											<button
												type="button"
												className="text-[9px] text-destructive hover:text-destructive/80 px-1"
												onClick={() => handleClear(field.key)}
											>
												Limpar
											</button>
										)}
									</>
								)}
							</div>
						</div>

						{hasValue && !isVisible ? (
							<button type="button"
								className="w-full rounded-md border bg-muted/30 px-2.5 py-1.5 text-[11px] font-mono text-muted-foreground cursor-default select-none"
								onClick={() => toggleVisibility(field.key)}
							>
								{"•".repeat(Math.min(effectiveValue.length, 24))}
							</button>
						) : (
							<input
								type={isVisible ? "text" : "password"}
								placeholder={field.placeholder}
								value={isFromEnv ? envValue : (localValue || "")}
								onChange={(e) => handleSave(field.key, e.target.value)}
								disabled={isFromEnv}
								className={cn(
									"w-full rounded-md border bg-transparent px-2.5 py-1.5 text-[11px] outline-none",
									"focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40",
									"font-mono",
									isFromEnv && "opacity-60 cursor-not-allowed",
								)}
							/>
						)}

						<p className="text-[10px] text-muted-foreground">{field.description}</p>
					</div>
				);
			})}
		</div>
	);
}
