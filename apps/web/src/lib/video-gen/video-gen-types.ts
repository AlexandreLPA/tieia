export type VideoProvider = "replicate" | "seedance" | "stability" | "luma" | "kling" | "local";

export type VideoGenMode = "text-to-video" | "image-to-video" | "video-to-video";

export interface VideoModel {
	id: string;
	name: string;
	provider: VideoProvider;
	description: string;
	maxDuration: number;
	supportedModes: VideoGenMode[];
	aspectRatios: string[];
	costLabel: string;
	/** US$ per generated second, checked 2026-10-19 on the providers' pages: 0 = free, null = billed in provider credits */
	costPerSecondUsd: number | null;
}

export const VIDEO_MODELS: VideoModel[] = [
	{
		id: "cogvideox-2b",
		name: "CogVideoX (Local)",
		provider: "local",
		description: "Modelo aberto e antigo, roda no seu PC; clipes curtos e simples",
		maxDuration: 6,
		supportedModes: ["text-to-video"],
		aspectRatios: ["16:9", "9:16", "1:1"],
		costLabel: "Grátis",
		costPerSecondUsd: 0,
	},
	{
		id: "seedance-1-pro-fast",
		name: "Seedance 1 Pro Fast",
		provider: "replicate",
		description: "ByteDance — rápido e barato, bom para B-roll e produto (720p)",
		maxDuration: 12,
		supportedModes: ["text-to-video", "image-to-video"],
		aspectRatios: ["16:9", "9:16", "1:1"],
		costLabel: "US$ 0,025/s",
		costPerSecondUsd: 0.025,
	},
	{
		id: "hailuo-02",
		name: "Hailuo 02",
		provider: "replicate",
		description: "MiniMax — movimento realista, ótimo para pessoas e produto (768p)",
		maxDuration: 10,
		supportedModes: ["text-to-video", "image-to-video"],
		aspectRatios: ["16:9", "9:16", "1:1"],
		costLabel: "US$ 0,045/s",
		costPerSecondUsd: 0.045,
	},
	{
		id: "veo-3.1-lite",
		name: "Veo 3.1 Lite",
		provider: "replicate",
		description: "Google — o mesmo modelo do Flow, versão econômica (720p)",
		maxDuration: 8,
		supportedModes: ["text-to-video", "image-to-video"],
		aspectRatios: ["16:9", "9:16", "1:1"],
		costLabel: "US$ 0,05/s",
		costPerSecondUsd: 0.05,
	},
	{
		id: "runway-gen4-turbo",
		name: "Runway Gen-4 Turbo",
		provider: "replicate",
		description: "Runway — anima uma imagem sua; precisa de imagem inicial (720p)",
		maxDuration: 10,
		supportedModes: ["image-to-video"],
		aspectRatios: ["16:9", "9:16", "1:1"],
		costLabel: "US$ 0,05/s",
		costPerSecondUsd: 0.05,
	},
	{
		id: "luma-ray-3.2",
		name: "Luma Ray 3.2",
		provider: "luma",
		description: "Luma — cinematográfico, boa câmera e iluminação (720p)",
		maxDuration: 10,
		supportedModes: ["text-to-video", "image-to-video"],
		aspectRatios: ["16:9", "9:16", "1:1"],
		costLabel: "US$ 0,06/s",
		costPerSecondUsd: 0.06,
	},
	{
		id: "kling-v2.5-turbo-pro",
		name: "Kling 2.5 Turbo Pro",
		provider: "replicate",
		description: "Kling — muito bom para pessoas e ações (1080p)",
		maxDuration: 10,
		supportedModes: ["text-to-video", "image-to-video"],
		aspectRatios: ["16:9", "9:16", "1:1"],
		costLabel: "US$ 0,07/s",
		costPerSecondUsd: 0.07,
	},
	{
		id: "seedance-2.0",
		name: "Seedance 2.0",
		provider: "seedance",
		description: "ByteDance via PiAPI — alta qualidade, até 15 s (720p)",
		maxDuration: 15,
		supportedModes: ["text-to-video"],
		aspectRatios: ["16:9", "9:16", "1:1"],
		costLabel: "US$ 0,20/s",
		costPerSecondUsd: 0.2,
	},
];

export const VIDEO_ASPECT_RATIOS = [
	{ id: "16:9", label: "16:9 Paisagem", width: 1920, height: 1080 },
	{ id: "9:16", label: "9:16 Vertical", width: 1080, height: 1920 },
	{ id: "1:1", label: "1:1 Quadrado", width: 1080, height: 1080 },
	{ id: "4:3", label: "4:3 Padrão", width: 1440, height: 1080 },
	{ id: "3:4", label: "3:4 Retrato", width: 1080, height: 1440 },
	{ id: "21:9", label: "21:9 Ultrawide", width: 2560, height: 1080 },
] as const;

export type VideoAspectRatioId = (typeof VIDEO_ASPECT_RATIOS)[number]["id"];

export interface VideoGenProviderConfig {
	provider: VideoProvider;
	/** @deprecated Server-side env vars are never read in the browser (audit H-3). Keys live in localStorage. */
	apiKeyEnvVar: string;
	apiKeyLocalStorageKey: string;
	headerName: string;
	label: string;
	signupUrl: string;
	description: string;
}

export const VIDEO_PROVIDER_CONFIGS: VideoGenProviderConfig[] = [
	{
		provider: "replicate",
		apiKeyEnvVar: "REPLICATE_API_TOKEN",
		apiKeyLocalStorageKey: "replicate",
		headerName: "X-Replicate-Api-Token",
		label: "Replicate",
		signupUrl: "https://replicate.com",
		description: "Acesse Runway Gen-3, Pika, Kling, MiniMax, Stable Video e mais de 10 modelos. Uma única chave de API, pague pelo uso.",
	},
	{
		provider: "seedance",
		apiKeyEnvVar: "SEEDANCE_API_KEY",
		apiKeyLocalStorageKey: "seedance",
		headerName: "X-Seedance-Api-Key",
		label: "Seedance (PiAPI)",
		signupUrl: "https://piapi.ai",
		description: "ByteDance Seedance 2.0 via PiAPI. Texto para vídeo de alta qualidade, até 15s.",
	},
	{
		provider: "stability",
		apiKeyEnvVar: "STABILITY_API_KEY",
		apiKeyLocalStorageKey: "stability",
		headerName: "X-Stability-Api-Key",
		label: "Stability AI",
		signupUrl: "https://platform.stability.ai",
		description: "Stable Video Diffusion e futuros modelos de vídeo da Stability.",
	},
	{
		provider: "luma",
		apiKeyEnvVar: "LUMA_API_KEY",
		apiKeyLocalStorageKey: "luma",
		headerName: "X-Luma-Api-Key",
		label: "Luma AI",
		signupUrl: "https://lumalabs.ai/dream-machine",
		description: "Dream Machine — movimento realista e controle de câmera.",
	},
];

export function getModelsForProvider(provider: VideoProvider): VideoModel[] {
	return VIDEO_MODELS.filter((m) => m.provider === provider);
}

export function getModelById(id: string): VideoModel | undefined {
	return VIDEO_MODELS.find((m) => m.id === id);
}

export function getProviderForModel(modelId: string): VideoProvider | undefined {
	return VIDEO_MODELS.find((m) => m.id === modelId)?.provider;
}

export function getProviderConfig(provider: VideoProvider): VideoGenProviderConfig | undefined {
	return VIDEO_PROVIDER_CONFIGS.find((c) => c.provider === provider);
}

export function isProviderKeyRequired(provider: VideoProvider): boolean {
	return provider !== "local";
}

const PROVIDER_LABELS: Record<VideoProvider, string> = {
	replicate: "Replicate",
	seedance: "PiAPI",
	stability: "Stability AI",
	luma: "Luma AI",
	kling: "Kling",
	local: "no seu PC",
};

export function getProviderLabel(provider: VideoProvider): string {
	return PROVIDER_LABELS[provider];
}

export function formatUsd(value: number): string {
	return `US$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
}

/** "Grátis", "US$ 0,025/s" or "créditos PiAPI" */
export function formatVideoCostPerSecond(model: VideoModel): string {
	if (model.costPerSecondUsd === 0) return "Grátis";
	if (model.costPerSecondUsd === null) return `créditos ${getProviderLabel(model.provider)}`;
	return `${formatUsd(model.costPerSecondUsd)}/s`;
}

/** Free models first, then paid ones from cheapest; credit-billed last */
export function sortModelsByCost(models: VideoModel[]): VideoModel[] {
	const rank = (m: VideoModel) => (m.costPerSecondUsd === null ? Number.POSITIVE_INFINITY : m.costPerSecondUsd);
	return [...models].sort((a, b) => rank(a) - rank(b));
}
