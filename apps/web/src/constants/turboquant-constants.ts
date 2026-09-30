/**
 * TurboQuant optimization constants.
 *
 * TurboQuant achieves 3-bit KV cache quantization with zero accuracy loss
 * using PolarQuant + QJL. These constants define model tiers, memory budgets,
 * and quantization configurations for the frontend UI.
 */

// ---------------------------------------------------------------------------
// Memory budget presets
// ---------------------------------------------------------------------------

export const MEMORY_BUDGETS = [
	{ value: "auto", label: "Detecção automática", description: "Detecta automaticamente a RAM disponível" },
	{ value: "4GB", label: "4 GB", description: "Básico: somente modelos Lite" },
	{ value: "8GB", label: "8 GB", description: "Padrão: modelos de 3B com quantização" },
	{ value: "16GB", label: "16 GB", description: "Pro: modelos de 7B-8B com TurboQuant" },
	{ value: "32GB", label: "32 GB", description: "Completo: todos os modelos, contexto completo" },
] as const;

// ---------------------------------------------------------------------------
// Model tiers (mirrors backend model_registry.py)
// ---------------------------------------------------------------------------

export const MODEL_TIERS = [
	{
		name: "lite" as const,
		label: "Lite",
		description: "Consumo mínimo — funciona com 4-8 GB de RAM. Inclui Kimi K2 Q3 (3-bit)",
		ramRange: "4-8 GB",
		defaultModel: "llama3.2:1b",
		quality: "Bom",
	},
	{
		name: "standard" as const,
		label: "Standard",
		description: "Melhor equilíbrio entre qualidade e tamanho — 8-16 GB de RAM. Inclui Kimi K2 Q4, Gemma 4 E2B (5B)",
		ramRange: "8-16 GB",
		defaultModel: "llama3.2:3b-instruct-q4_K_M",
		quality: "Ótimo",
	},
	{
		name: "pro" as const,
		label: "Pro",
		description: "Qualidade máxima — 16-32+ GB de RAM ou GPU. Inclui Kimi K2 Q5, Gemma 4 E4B, 26B MoE, 31B Dense",
		ramRange: "16-32+ GB",
		defaultModel: "llama3.1:8b-instruct-q4_K_M",
		quality: "Excelente",
	},
] as const;

// ---------------------------------------------------------------------------
// KV cache quantization configurations
// ---------------------------------------------------------------------------

// NOTE: the `quality` values below ("Near-lossless" / "Minor degradation" /
// "Noticeable loss") are matched by exact string in
// components/editor/panels/assets/views/settings.tsx to pick a badge color
// (config.quality === "Near-lossless", etc). They must stay in English
// verbatim — only `label` and `description` are translated here.
export const KV_CACHE_CONFIGS = [
	{
		bits: 4,
		label: "4-bit (Recomendado)",
		compressionRatio: 3.8,
		cosineSimilarity: 0.9986,
		quality: "Near-lossless",
		description: "Seguro para todas as cargas de trabalho em produção. Redução de 74% na memória.",
		recommended: true,
	},
	{
		bits: 3,
		label: "3-bit (Eficiência)",
		compressionRatio: 5.0,
		cosineSimilarity: 0.9953,
		quality: "Minor degradation",
		description: "Bom para a maioria das tarefas. Redução de 80% na memória.",
		recommended: false,
	},
	{
		bits: 2,
		label: "2-bit (Agressivo)",
		compressionRatio: 7.3,
		cosineSimilarity: 0.9874,
		quality: "Noticeable loss",
		description: "Compressão extrema. Evite para tarefas criativas. Redução de 86% na memória.",
		recommended: false,
	},
] as const;

// ---------------------------------------------------------------------------
// Quantization format labels (for Ollama GGUF models)
// ---------------------------------------------------------------------------

export const QUANTIZATION_LABELS: Record<string, string> = {
	fp16: "FP16 (Precisão total)",
	q8_0: "Q8 (8-bit)",
	q5_K_M: "Q5_K_M (5-bit)",
	q4_K_M: "Q4_K_M (4-bit)",
	q3_K_M: "Q3_K_M (3-bit)",
	q2_K: "Q2_K (2-bit)",
};

// ---------------------------------------------------------------------------
// Stack memory benchmarks (from TURBOQUANT_INTEGRATION.md)
// ---------------------------------------------------------------------------

export const STACK_BENCHMARKS = {
	withoutTurboQuant: {
		"ollama_3b_whisper_base_tts": { label: "Ollama 3B + Whisper + TTS", memoryGb: 12 },
		"ollama_7b_whisper_medium_tts_sd": { label: "Ollama 7B + Whisper Medium + TTS + SD", memoryGb: 30 },
		"full_stack": { label: "Full stack (todos os serviços)", memoryGb: 35 },
	},
	withTurboQuant: {
		"ollama_3b_whisper_base_tts": { label: "Ollama 3B + Whisper + TTS", memoryGb: 5 },
		"ollama_7b_whisper_medium_tts_sd": { label: "Ollama 7B + Whisper Medium + TTS + SD", memoryGb: 12 },
		"full_stack": { label: "Full stack (todos os serviços)", memoryGb: 15 },
	},
} as const;

export type MemoryBudget = (typeof MEMORY_BUDGETS)[number]["value"];
export type ModelTierName = (typeof MODEL_TIERS)[number]["name"];
