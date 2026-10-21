"use client";

import { useCallback, useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/ui";
import { aiClient } from "@/lib/ai-client";
import type { TurboQuantStatus } from "@/types/ai";
import { toast } from "sonner";


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

export function AIOptimizationSection() {
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
										<svg className="size-3 text-primary shrink-0" viewBox="0 0 16 16" fill="none">
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
										<svg className="size-3 text-primary shrink-0" viewBox="0 0 16 16" fill="none">
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
										<svg className="size-3 text-primary shrink-0" viewBox="0 0 16 16" fill="none">
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
									<svg className="size-3 text-primary shrink-0" viewBox="0 0 16 16" fill="none">
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
