import type { ExportOptions, ExportResolution } from "@/types/export";

export const DEFAULT_EXPORT_OPTIONS = {
	format: "mp4",
	quality: "high",
	resolution: "original",
	includeAudio: true,
	normalizeLoudness: true,
} satisfies ExportOptions;

export const EXPORT_MIME_TYPES = {
	webm: "video/webm",
	mp4: "video/mp4",
	m4a: "audio/mp4",
} as const;

// Shorter side of the exported frame, so portrait and square projects keep
// their shape: 720p is 1280x720 for 16:9 and 720x1280 for 9:16
export const EXPORT_RESOLUTION_SHORT_SIDE = {
	"480p": 480,
	"720p": 720,
	"1080p": 1080,
	"4k": 2160,
} as const satisfies Record<Exclude<ExportResolution, "original">, number>;

export const EXPORT_RESOLUTION_LABELS = {
	original: "Original",
	"480p": "480p",
	"720p": "720p",
	"1080p": "1080p",
	"4k": "4K",
} as const satisfies Record<ExportResolution, string>;

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
		options: {
			format: "mp4",
			quality: "high",
			resolution: "1080p",
			includeAudio: true,
		},
		tip: "O YouTube recodifica tudo, então qualidade alta garante o melhor resultado após o processamento.",
	},
	{
		id: "youtube-4k",
		name: "YouTube 4K",
		description: "MP4 4K, qualidade máxima para telas grandes",
		options: {
			format: "mp4",
			quality: "very_high",
			resolution: "4k",
			includeAudio: true,
		},
		tip: "Envie na maior qualidade que sua fonte permitir. O YouTube cria versões de resolução menor automaticamente.",
	},
	{
		id: "tiktok",
		name: "TikTok / Reels",
		description: "MP4 9:16, otimizado para celular",
		options: {
			format: "mp4",
			quality: "high",
			resolution: "1080p",
			includeAudio: true,
		},
		tip: "Mantenha abaixo de 60s para melhor alcance. O TikTok comprime bastante, então exporte em alta qualidade.",
	},
	{
		id: "instagram",
		name: "Instagram",
		description: "MP4, funciona para feed, stories e reels",
		options: {
			format: "mp4",
			quality: "high",
			resolution: "1080p",
			includeAudio: true,
		},
		tip: "Quadrado (1:1) para posts do feed, vertical (9:16) para stories e reels.",
	},
	{
		id: "twitter",
		name: "Twitter / X",
		description: "MP4 720p, limite de 2min20s no plano gratuito",
		options: {
			format: "mp4",
			quality: "medium",
			resolution: "720p",
			includeAudio: true,
		},
		tip: "O Twitter tem limite de 512MB. Qualidade média mantém o tamanho do arquivo sob controle.",
	},
	{
		id: "web",
		name: "Web / e-mail",
		description: "WebM 720p, arquivo menor",
		options: {
			format: "webm",
			quality: "medium",
			resolution: "720p",
			includeAudio: true,
		},
		tip: "O WebM gera arquivos menores para incorporar em sites. Nem todo cliente de e-mail é compatível com vídeo.",
	},
	{
		id: "podcast",
		name: "Podcast (somente áudio)",
		description: "M4A (AAC), sem vídeo",
		options: { format: "m4a", quality: "high", includeAudio: true },
		tip: "Gera um arquivo .m4a só com o áudio da timeline, aceito pelas plataformas de podcast e pelos players comuns.",
	},
	{
		id: "custom",
		name: "Personalizado",
		description: "Escolha seu próprio formato e qualidade",
		options: {
			format: "mp4",
			quality: "high",
			resolution: "original",
			includeAudio: true,
		},
	},
];
