export const SUGGESTED_MODELS = [
	{ name: "llama3.2:1b", description: "Mais rápido, recursos mínimos", size: "~1.3 GB", device: "cpu" as const, turboquant: true },
	{ name: "kimi-k2:latest", description: "MoonshotAI Kimi K2 — raciocínio de ponta, 3 bits (nível Lite)", size: "~1.4 GB", device: "cpu" as const, turboquant: true },
	{ name: "llama3.2:3b", description: "Rápido e leve — bom para comandos e análises", size: "~2 GB", device: "cpu" as const, turboquant: true },
	{ name: "kimi-k2:q4_K_M", description: "MoonshotAI Kimi K2 — tarefas agênticas de contexto longo, 4 bits (nível Standard)", size: "~3 GB", device: "cpu" as const, turboquant: true },
	{ name: "mistral:7b", description: "Alta qualidade, precisa de mais RAM", size: "~4.1 GB", device: "cpu" as const, turboquant: true },
	{ name: "llama3.1:8b", description: "Melhor qualidade da linha Llama, precisa de 8+ GB", size: "~4.9 GB", device: "gpu" as const, turboquant: true },
	{ name: "kimi-k2:q5_K_M", description: "MoonshotAI Kimi K2 — 5 bits quase sem perdas, melhor raciocínio (nível Pro)", size: "~7 GB", device: "gpu" as const, turboquant: true },
	{ name: "qwen2.5:3b", description: "Multilíngue forte, validado pelo TurboQuant", size: "~2 GB", device: "cpu" as const, turboquant: true },
	{ name: "qwen2.5:7b", description: "Excelente qualidade, multilíngue", size: "~4.7 GB", device: "gpu" as const, turboquant: true },
	{ name: "phi3.5:3.8b", description: "Microsoft Phi — contexto de 128K, compacto", size: "~2.2 GB", device: "cpu" as const, turboquant: true },
	{ name: "gemma2:2b", description: "Google Gemma 2 — eficiente e rápido", size: "~1.6 GB", device: "cpu" as const, turboquant: true },
	{ name: "gemma4:e2b", description: "Google Gemma 4 — multimodal any-to-any de 5B", size: "~7.2 GB", device: "cpu" as const, turboquant: true },
	{ name: "gemma4:e4b", description: "Google Gemma 4 — multimodal any-to-any de 8B", size: "~9.6 GB", device: "gpu" as const, turboquant: true },
	{ name: "gemma4:26b", description: "Google Gemma 4 MoE — 26B parâmetros, 4B ativos", size: "~18 GB", device: "gpu" as const, turboquant: true },
	{ name: "gemma4:31b", description: "Google Gemma 4 Dense — qualidade máxima 31B", size: "~20 GB", device: "gpu" as const, turboquant: true },
];

// Cloud models via OpenRouter — no download, but the prompt text leaves this
// machine. Only usable once OPENROUTER_API_KEY is set in .env.
export const SUGGESTED_CLOUD_MODELS = [
	{
		id: "nvidia/nemotron-3.5-super-vl:free",
		name: "Nemotron 3.5 Super VL",
		description: "Recomendado — NVIDIA, grátis, 1M de contexto, aceita texto/imagem/vídeo (necessário para a Pontuação Viral).",
	},
	{
		id: "google/gemma-4-31b-it:free",
		name: "Gemma 4 31B",
		description: "Google — grátis, 262K de contexto, aceita texto/imagem/vídeo. Boa reserva.",
	},
	{
		id: "nvidia/nemotron-3-ultra-550b-a55b:free",
		name: "Nemotron 3 Ultra",
		description: "NVIDIA — grátis, 1M de contexto, só texto (não analisa quadros do vídeo).",
	},
];

export const SUGGESTED_TTS_MODELS = [
	{ name: "xtts_v2", description: "Melhor qualidade — multilíngue, clonagem de voz", size: "~1.8 GB", device: "cpu" as const, multilingual: true, voiceCloning: true },
	{ name: "your_tts", description: "Multilíngue, clonagem de voz, mais leve", size: "~290 MB", device: "cpu" as const, multilingual: true, voiceCloning: true },
	{ name: "kitten_tts", description: "Rápido e expressivo — baixo consumo de recursos", size: "~500 MB", device: "cpu" as const, multilingual: false, voiceCloning: false },
	{ name: "vits-en", description: "Somente inglês — rápido e leve", size: "~110 MB", device: "cpu" as const, multilingual: false, voiceCloning: false },
	{ name: "vits-en-multi", description: "Inglês, múltiplos locutores", size: "~140 MB", device: "cpu" as const, multilingual: false, voiceCloning: false },
	{ name: "tacotron2-en", description: "Inglês — clássico e confiável", size: "~130 MB", device: "cpu" as const, multilingual: false, voiceCloning: false },
];

export const SUGGESTED_WHISPER_MODELS = [
	{ name: "tiny", description: "Mais rápido — precisão mínima", size: "~75 MB", device: "cpu" as const },
	{ name: "base", description: "Bom equilíbrio entre velocidade e precisão", size: "~140 MB", device: "cpu" as const },
	{ name: "small", description: "Melhor precisão, velocidade moderada", size: "~460 MB", device: "cpu" as const },
	{ name: "medium", description: "Alta precisão, mais lento", size: "~1.5 GB", device: "cpu" as const },
	{ name: "large-v3", description: "Melhor precisão — precisa de 4+ GB", size: "~3 GB", device: "gpu" as const },
];

export const SUGGESTED_IMAGE_MODELS = [
	{ name: "stable-diffusion-2-1", description: "Boa qualidade — padrão versátil", size: "~5 GB", device: "gpu" as const },
	{ name: "sdxl-turbo", description: "SDXL rápido — geração em 1 a 4 passos", size: "~7 GB", device: "gpu" as const },
	{ name: "sdxl-base", description: "Qualidade máxima — SDXL 1.0", size: "~7 GB", device: "gpu" as const },
	{ name: "sd-1.5", description: "SD 1.5 clássico — ecossistema enorme", size: "~4 GB", device: "gpu" as const },
	{ name: "flux-schnell", description: "FLUX.1 Schnell — rápido, alta qualidade", size: "~12 GB", device: "gpu" as const },
	{ name: "segmind-tiny", description: "SD minúsculo — leve para CPU, compacto", size: "~1 GB", device: "cpu" as const },
	{ name: "small-sd", description: "SD pequeno — roda em CPU, qualidade decente", size: "~1.5 GB", device: "cpu" as const },
];

// ----- Component -----

