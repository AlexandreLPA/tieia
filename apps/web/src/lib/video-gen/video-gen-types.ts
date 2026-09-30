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
}

export const VIDEO_MODELS: VideoModel[] = [
	{
		id: "runway-gen3-alpha",
		name: "Runway Gen-3 Alpha",
		provider: "replicate",
		description: "Geração de vídeo cinematográfico de alta qualidade com excelente movimento",
		maxDuration: 10,
		supportedModes: ["text-to-video", "image-to-video"],
		aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
		costLabel: "~$0.05/sec",
	},
	{
		id: "pika-1.0",
		name: "Pika 1.0",
		provider: "replicate",
		description: "Geração de vídeo criativo com estilos artísticos",
		maxDuration: 4,
		supportedModes: ["text-to-video", "image-to-video"],
		aspectRatios: ["16:9", "9:16", "1:1"],
		costLabel: "~$0.03/sec",
	},
	{
		id: "minimax-video-01",
		name: "MiniMax Video-01",
		provider: "replicate",
		description: "Geração de alta fidelidade com forte aderência ao prompt",
		maxDuration: 6,
		supportedModes: ["text-to-video", "image-to-video"],
		aspectRatios: ["16:9", "9:16", "1:1"],
		costLabel: "~$0.04/sec",
	},
	{
		id: "stable-video-diffusion",
		name: "Stable Video Diffusion",
		provider: "replicate",
		description: "Animação de imagem para vídeo usando tecnologia da Stability AI",
		maxDuration: 4,
		supportedModes: ["image-to-video"],
		aspectRatios: ["16:9", "9:16", "1:1"],
		costLabel: "~$0.02/sec",
	},
	{
		id: "kling-v1.6",
		name: "Kling v1.6 Pro",
		provider: "replicate",
		description: "Modelo de vídeo da ByteDance com movimento forte e sincronia labial",
		maxDuration: 10,
		supportedModes: ["text-to-video", "image-to-video", "video-to-video"],
		aspectRatios: ["16:9", "9:16", "1:1"],
		costLabel: "~$0.06/sec",
	},
	{
		id: "seedance-2.0",
		name: "Seedance 2.0",
		provider: "seedance",
		description: "ByteDance Seedance via PiAPI — alta qualidade, rápido",
		maxDuration: 15,
		supportedModes: ["text-to-video"],
		aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
		costLabel: "PiAPI credits",
	},
	{
		id: "stable-video-xt",
		name: "Stable Video XT",
		provider: "stability",
		description: "Modelo de geração de vídeo mais recente da Stability AI",
		maxDuration: 4,
		supportedModes: ["text-to-video", "image-to-video"],
		aspectRatios: ["16:9", "9:16", "1:1"],
		costLabel: "~$0.03/sec",
	},
	{
		id: "luma-dream-machine",
		name: "Luma Dream Machine",
		provider: "luma",
		description: "Dream Machine da Luma AI para movimento e câmera realistas",
		maxDuration: 5,
		supportedModes: ["text-to-video", "image-to-video"],
		aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
		costLabel: "~$0.04/sec",
	},
	{
		id: "cogvideox-2b",
		name: "CogVideoX (Local)",
		provider: "local",
		description: "Geração local gratuita via CogVideoX-2b (não precisa de chave de API)",
		maxDuration: 6,
		supportedModes: ["text-to-video"],
		aspectRatios: ["16:9", "9:16", "1:1"],
		costLabel: "Free (local GPU)",
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
		apiKeyEnvVar: "NEXT_PUBLIC_REPLICATE_API_TOKEN",
		apiKeyLocalStorageKey: "replicate",
		headerName: "X-Replicate-Api-Token",
		label: "Replicate",
		signupUrl: "https://replicate.com",
		description: "Acesse Runway Gen-3, Pika, Kling, MiniMax, Stable Video e mais de 10 modelos. Uma única chave de API, pague pelo uso.",
	},
	{
		provider: "seedance",
		apiKeyEnvVar: "NEXT_PUBLIC_SEEDANCE_API_KEY",
		apiKeyLocalStorageKey: "seedance",
		headerName: "X-Seedance-Api-Key",
		label: "Seedance (PiAPI)",
		signupUrl: "https://piapi.ai",
		description: "ByteDance Seedance 2.0 via PiAPI. Texto para vídeo de alta qualidade, até 15s.",
	},
	{
		provider: "stability",
		apiKeyEnvVar: "NEXT_PUBLIC_STABILITY_API_KEY",
		apiKeyLocalStorageKey: "stability",
		headerName: "X-Stability-Api-Key",
		label: "Stability AI",
		signupUrl: "https://platform.stability.ai",
		description: "Stable Video Diffusion e futuros modelos de vídeo da Stability.",
	},
	{
		provider: "luma",
		apiKeyEnvVar: "NEXT_PUBLIC_LUMA_API_KEY",
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
