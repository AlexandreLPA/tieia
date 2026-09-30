import type { TCanvasSize } from "@/types/project";

export const DEFAULT_CANVAS_PRESETS: TCanvasSize[] = [
	{ width: 1920, height: 1080 },
	{ width: 1080, height: 1920 },
	{ width: 1080, height: 1080 },
	{ width: 1440, height: 1080 },
];

export interface FramePreset {
	id: string;
	label: string;
	shortLabel: string;
	canvas: TCanvasSize;
	ratio: string;
}

export const FRAME_PRESETS: FramePreset[] = [
	{
		id: "landscape",
		label: "YouTube / Paisagem",
		shortLabel: "16:9",
		canvas: { width: 1920, height: 1080 },
		ratio: "16:9",
	},
	{
		id: "portrait",
		label: "TikTok / Reels / Shorts",
		shortLabel: "9:16",
		canvas: { width: 1080, height: 1920 },
		ratio: "9:16",
	},
	{
		id: "square",
		label: "Instagram / Quadrado",
		shortLabel: "1:1",
		canvas: { width: 1080, height: 1080 },
		ratio: "1:1",
	},
	{
		id: "classic",
		label: "Clássico / 4:3",
		shortLabel: "4:3",
		canvas: { width: 1440, height: 1080 },
		ratio: "4:3",
	},
];

export const FPS_PRESETS = [
	{ value: "24", label: "24 fps" },
	{ value: "25", label: "25 fps" },
	{ value: "30", label: "30 fps" },
	{ value: "60", label: "60 fps" },
	{ value: "120", label: "120 fps" },
] as const;

export const BLUR_INTENSITY_PRESETS: { label: string; value: number }[] = [
	{ label: "Leve", value: 4 },
	{ label: "Médio", value: 8 },
	{ label: "Forte", value: 18 },
] as const;

export const DEFAULT_CANVAS_SIZE: TCanvasSize = { width: 1920, height: 1080 };
export const DEFAULT_FPS = 30;
export const DEFAULT_BLUR_INTENSITY = 8;
export const DEFAULT_COLOR = "#000000";

// ---------------------------------------------------------------------------
// Project Templates — pre-configured starting points for common use cases
// ---------------------------------------------------------------------------

export interface ProjectTemplate {
	id: string;
	name: string;
	description: string;
	icon: string;
	canvas: TCanvasSize;
	fps: number;
	tips: string[];
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
	{
		id: "youtube",
		name: "Vídeo para YouTube",
		description: "Vídeo padrão em formato paisagem para o YouTube",
		icon: "youtube",
		canvas: { width: 1920, height: 1080 },
		fps: 30,
		tips: [
			"Importe seu vídeo e transcreva",
			"Edite o texto para cortar erros e vícios de linguagem",
			"Adicione legendas para melhorar o engajamento",
			"Exporte em MP4 alta qualidade",
		],
	},
	{
		id: "tiktok",
		name: "TikTok / Reels",
		description: "Vídeo vertical de curta duração",
		icon: "tiktok",
		canvas: { width: 1080, height: 1920 },
		fps: 30,
		tips: [
			"Mantenha abaixo de 60 segundos para melhor alcance",
			"Adicione legendas em destaque — a maioria assiste sem som",
			"Remova silêncios para um ritmo mais dinâmico",
			"Exporte em MP4 alta qualidade",
		],
	},
	{
		id: "podcast",
		name: "Clipe de podcast",
		description: "Limpe o áudio do podcast e adicione elementos visuais",
		icon: "podcast",
		canvas: { width: 1920, height: 1080 },
		fps: 24,
		tips: [
			"Transcreva para encontrar os melhores trechos facilmente",
			"Remova vícios de linguagem e pausas longas",
			"Adicione um rodapé (lower-third) com o nome do locutor",
			"Limpe o áudio para remover ruído de fundo",
		],
	},
	{
		id: "instagram",
		name: "Post do Instagram",
		description: "Formato quadrado para o feed do Instagram",
		icon: "instagram",
		canvas: { width: 1080, height: 1080 },
		fps: 30,
		tips: [
			"Mantenha abaixo de 60 segundos para posts do feed",
			"Adicione legendas — a maioria assiste sem som",
			"Use os primeiros 3 segundos para prender a atenção",
			"Exporte em MP4 alta qualidade",
		],
	},
	{
		id: "presentation",
		name: "Apresentação / tutorial",
		description: "Gravação de tela ou conteúdo educacional",
		icon: "presentation",
		canvas: { width: 1920, height: 1080 },
		fps: 30,
		tips: [
			"Transcreva para navegar por tópico",
			"Remova erros excluindo frases",
			"Adicione marcadores de capítulo para navegação",
			"Use overlays de infográficos para os pontos principais",
		],
	},
	{
		id: "custom",
		name: "Personalizado",
		description: "Comece com suas próprias configurações",
		icon: "custom",
		canvas: { width: 1920, height: 1080 },
		fps: 30,
		tips: [
			"Escolha o tamanho da tela e a taxa de quadros",
			"Importe qualquer mídia para começar",
		],
	},
];
