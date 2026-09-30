export interface ThumbnailGenParams {
	prompt: string;
	style: "cinematic" | "bold-text" | "minimal" | "gradient" | "collage";
	width: number;
	height: number;
	includeText: boolean;
	headline: string;
	colorScheme: "vibrant" | "dark" | "warm" | "cool" | "mono";
}

export interface ThumbnailGenResult {
	imageUrl: string;
	seed: number;
	width: number;
	height: number;
}

export const THUMBNAIL_STYLES = [
	{ value: "cinematic", label: "Cinematográfico", desc: "Iluminação dramática, grão de filme" },
	{ value: "bold-text", label: "Texto em Negrito", desc: "Texto grande, alto contraste" },
	{ value: "minimal", label: "Minimalista", desc: "Limpo, simples, bastante espaço" },
	{ value: "gradient", label: "Gradiente", desc: "Fundos com gradientes coloridos" },
	{ value: "collage", label: "Colagem", desc: "Layout com múltiplas imagens" },
] as const;

export const THUMBNAIL_SIZES = [
	{ width: 1280, height: 720, label: "YouTube (16:9)" },
	{ width: 1080, height: 1920, label: "TikTok (9:16)" },
	{ width: 1080, height: 1080, label: "Instagram (1:1)" },
	{ width: 1080, height: 1350, label: "Instagram (4:5)" },
] as const;

export const COLOR_SCHEMES = [
	{ value: "vibrant", label: "Vibrante" },
	{ value: "dark", label: "Escuro" },
	{ value: "warm", label: "Quente" },
	{ value: "cool", label: "Frio" },
	{ value: "mono", label: "Monocromático" },
] as const;

export const DEFAULT_THUMBNAIL_PARAMS: ThumbnailGenParams = {
	prompt: "",
	style: "cinematic",
	width: 1280,
	height: 720,
	includeText: true,
	headline: "",
	colorScheme: "vibrant",
};
