import type { ExportOptions } from "@/types/export";

export const DEFAULT_EXPORT_OPTIONS = {
	format: "mp4",
	quality: "high",
	includeAudio: true,
} satisfies ExportOptions;

export const EXPORT_MIME_TYPES = {
	webm: "video/webm",
	mp4: "video/mp4",
} as const;

// ---------------------------------------------------------------------------
// Smart Export Presets — platform-optimized export configurations
// ---------------------------------------------------------------------------

export interface ExportPreset {
	id: string;
	name: string;
	description: string;
	options: ExportOptions;
	tip?: string;
}

export const EXPORT_PRESETS: ExportPreset[] = [
	{
		id: "youtube",
		name: "YouTube",
		description: "MP4 1080p, melhor compatibilidade",
		options: { format: "mp4", quality: "high", includeAudio: true },
		tip: "O YouTube recodifica tudo, então qualidade alta garante o melhor resultado após o processamento.",
	},
	{
		id: "youtube-4k",
		name: "YouTube 4K",
		description: "Qualidade máxima para telas grandes",
		options: { format: "mp4", quality: "very_high", includeAudio: true },
		tip: "Envie na maior qualidade que sua fonte permitir. O YouTube cria versões de resolução menor automaticamente.",
	},
	{
		id: "tiktok",
		name: "TikTok / Reels",
		description: "MP4 9:16, otimizado para celular",
		options: { format: "mp4", quality: "high", includeAudio: true },
		tip: "Mantenha abaixo de 60s para melhor alcance. O TikTok comprime bastante, então exporte em alta qualidade.",
	},
	{
		id: "instagram",
		name: "Instagram",
		description: "MP4, funciona para feed, stories e reels",
		options: { format: "mp4", quality: "high", includeAudio: true },
		tip: "Quadrado (1:1) para posts do feed, vertical (9:16) para stories e reels.",
	},
	{
		id: "twitter",
		name: "Twitter / X",
		description: "MP4, limite de 2min20s no plano gratuito",
		options: { format: "mp4", quality: "medium", includeAudio: true },
		tip: "O Twitter tem limite de 512MB. Qualidade média mantém o tamanho do arquivo sob controle.",
	},
	{
		id: "web",
		name: "Web / e-mail",
		description: "WebM, arquivo menor",
		options: { format: "webm", quality: "medium", includeAudio: true },
		tip: "O WebM gera arquivos menores para incorporar em sites. Nem todo cliente de e-mail é compatível com vídeo.",
	},
	{
		id: "podcast",
		name: "Podcast (somente áudio)",
		description: "Áudio extraído, sem vídeo",
		options: { format: "mp4", quality: "medium", includeAudio: true },
		tip: "Para distribuição apenas em áudio, extraia o áudio após a exportação usando qualquer conversor.",
	},
	{
		id: "custom",
		name: "Personalizado",
		description: "Escolha seu próprio formato e qualidade",
		options: { format: "mp4", quality: "high", includeAudio: true },
	},
];
