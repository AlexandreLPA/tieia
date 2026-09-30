export interface ProjectTemplate {
	id: string;
	name: string;
	description: string;
	category: "social" | "business" | "education" | "entertainment" | "personal";
	aspectRatio: "16:9" | "9:16" | "1:1" | "4:5";
	estimatedDuration: number;
	tags: string[];
	previewUrl?: string;
	tracks: Array<{
		type: "video" | "audio" | "text";
		name: string;
		description: string;
	}>;
}

export const TEMPLATE_CATEGORIES = [
	{ value: "social", label: "Redes Sociais" },
	{ value: "business", label: "Negócios" },
	{ value: "education", label: "Educação" },
	{ value: "entertainment", label: "Entretenimento" },
	{ value: "personal", label: "Pessoal" },
] as const;

export const BUILTIN_TEMPLATES: ProjectTemplate[] = [
	{
		id: "youtube-intro",
		name: "Abertura para YouTube",
		description: "Abertura animada com revelação de logo e música",
		category: "social",
		aspectRatio: "16:9",
		estimatedDuration: 10,
		tags: ["youtube", "intro", "animado"],
		tracks: [
			{ type: "video", name: "Animação do Logo", description: "Revelação do logo com partículas" },
			{ type: "text", name: "Nome do Canal", description: "Animação de texto em negrito" },
			{ type: "audio", name: "Música de Abertura", description: "Jingle de abertura animado" },
		],
	},
	{
		id: "tiktok-vlog",
		name: "TikTok Vlog",
		description: "Modelo de vlog vertical com legendas e música",
		category: "social",
		aspectRatio: "9:16",
		estimatedDuration: 60,
		tags: ["tiktok", "vlog", "vertical"],
		tracks: [
			{ type: "video", name: "Vídeo Principal", description: "Vídeo vertical em tela cheia" },
			{ type: "text", name: "Legendas", description: "Legendas geradas automaticamente" },
			{ type: "audio", name: "Música de Fundo", description: "Música em alta" },
		],
	},
	{
		id: "podcast-highlight",
		name: "Destaque de Podcast",
		description: "Clipe de podcast com forma de onda e identificação de locutores",
		category: "entertainment",
		aspectRatio: "16:9",
		estimatedDuration: 60,
		tags: ["podcast", "destaque", "forma de onda"],
		tracks: [
			{ type: "video", name: "Vídeo", description: "Vídeo principal do podcast" },
			{ type: "audio", name: "Áudio", description: "Áudio aprimorado" },
			{ type: "text", name: "Identificação de Locutores", description: "Nomes dos locutores com cores diferentes" },
		],
	},
	{
		id: "product-review",
		name: "Análise de Produto",
		description: "Análise de produto com seções de B-roll e avaliações",
		category: "business",
		aspectRatio: "16:9",
		estimatedDuration: 180,
		tags: ["produto", "análise", "negócios"],
		tracks: [
			{ type: "video", name: "Câmera Principal", description: "Pessoa falando para a câmera" },
			{ type: "video", name: "B-Roll", description: "Imagens do produto" },
			{ type: "text", name: "Notas", description: "Sobreposições de avaliação" },
			{ type: "audio", name: "Narração", description: "Locução" },
		],
	},
	{
		id: "classroom-lesson",
		name: "Aula em Sala de Aula",
		description: "Aula educacional com slides e anotações",
		category: "education",
		aspectRatio: "16:9",
		estimatedDuration: 300,
		tags: ["educação", "aula", "slides"],
		tracks: [
			{ type: "video", name: "Slides", description: "Slides de apresentação" },
			{ type: "video", name: "Câmera", description: "Câmera do instrutor (PIP)" },
			{ type: "text", name: "Anotações", description: "Pontos principais" },
			{ type: "audio", name: "Narração", description: "Narração em voz" },
		],
	},
	{
		id: "instagram-reel",
		name: "Instagram Reel",
		description: "Reel dinâmico com transições e efeitos em alta",
		category: "social",
		aspectRatio: "9:16",
		estimatedDuration: 30,
		tags: ["instagram", "reel", "dinâmico"],
		tracks: [
			{ type: "video", name: "Clipe Principal", description: "Vídeo vertical" },
			{ type: "text", name: "Texto Gancho", description: "Texto que prende a atenção" },
			{ type: "audio", name: "Música", description: "Áudio em alta" },
		],
	},
	{
		id: "travel-vlog",
		name: "Vlog de Viagem",
		description: "Montagem cinematográfica de viagem com mapas e transições",
		category: "personal",
		aspectRatio: "16:9",
		estimatedDuration: 120,
		tags: ["viagem", "cinematográfico", "montagem"],
		tracks: [
			{ type: "video", name: "Filmagens", description: "Filmagens de viagem" },
			{ type: "text", name: "Cartões de Localização", description: "Nomes dos lugares" },
			{ type: "audio", name: "Música", description: "Trilha sonora cinematográfica" },
			{ type: "audio", name: "Ambiente", description: "Sons naturais" },
		],
	},
	{
		id: "tutorial-step",
		name: "Tutorial Passo a Passo",
		description: "Tutorial em gravação de tela com passos numerados",
		category: "education",
		aspectRatio: "16:9",
		estimatedDuration: 180,
		tags: ["tutorial", "screencast", "passos"],
		tracks: [
			{ type: "video", name: "Gravação de Tela", description: "Screencast" },
			{ type: "text", name: "Números dos Passos", description: "Passo 1, 2, 3..." },
			{ type: "audio", name: "Locução", description: "Instruções" },
		],
	},
];
