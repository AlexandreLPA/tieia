import {
	AiMicIcon,
	Image01Icon,
	SparklesIcon,
	TextIcon,
} from "@hugeicons/core-free-icons";

export interface WorkflowStep {
	id: string;
	label: string;
	description: string;
	icon: typeof SparklesIcon;
	action: string;
	isCompleted?: boolean;
}

export type StudioMode = "chat" | "workflow" | "transcript" | "templates" | "ideas" | "broll" | "auto-broll" | "youtube-reels" | "dubbing" | "chapters" | "reframe" | "tracking" | "ab-testing" | "video-bg" | "edit-speaker";

export const VIDEO_WORKFLOWS: {
	id: string;
	title: string;
	description: string;
	steps: WorkflowStep[];
}[] = [
	{
		id: "youtube",
		title: "Vídeo para o YouTube",
		description: "Planeje, roteirize e produza um vídeo para o YouTube",
		steps: [
			{
				id: "brainstorm",
				label: "Brainstorm da ideia",
				description:
					"Descreva seu tema e público. A IA ajuda a refinar sua abordagem.",
				icon: SparklesIcon,
				action: "brainstorm",
			},
			{
				id: "outline",
				label: "Crie um esboço",
				description:
					"A IA gera um esboço estruturado com pontos-chave e marcações de tempo.",
				icon: TextIcon,
				action: "outline",
			},
			{
				id: "script",
				label: "Escreva o roteiro",
				description:
					"Transforme o esboço em um roteiro completo com introdução, desenvolvimento e CTA.",
				icon: TextIcon,
				action: "script",
			},
			{
				id: "record",
				label: "Grave e importe",
				description:
					"Grave seu vídeo seguindo o roteiro e depois importe-o aqui.",
				icon: AiMicIcon,
				action: "import",
			},
			{
				id: "transcribe",
				label: "Transcreva e edite",
				description:
					"Transcreva a gravação e depois edite o texto para editar o vídeo.",
				icon: AiMicIcon,
				action: "transcribe",
			},
			{
				id: "polish",
				label: "Aprimore com IA",
				description:
					"Remova vícios de linguagem e silêncios, adicione legendas e gere a miniatura.",
				icon: Image01Icon,
				action: "polish",
			},
		],
	},
	{
		id: "short",
		title: "Conteúdo em formato curto",
		description: "TikTok, Reels ou YouTube Shorts",
		steps: [
			{
				id: "hook",
				label: "Crie o gancho",
				description:
					"A IA ajuda a escrever um gancho de 3 segundos que prende a atenção.",
				icon: SparklesIcon,
				action: "hook",
			},
			{
				id: "script",
				label: "Roteirize o conteúdo",
				description:
					"Mantenha direto ao ponto — a IA estrutura sua mensagem para 30-60 segundos.",
				icon: TextIcon,
				action: "script-short",
			},
			{
				id: "record",
				label: "Grave na vertical",
				description:
					"Filme no formato retrato 9:16 seguindo o roteiro.",
				icon: AiMicIcon,
				action: "import",
			},
			{
				id: "edit",
				label: "Edição com cortes rápidos",
				description:
					"Remova silêncios e vícios de linguagem para um ritmo mais dinâmico.",
				icon: SparklesIcon,
				action: "fast-edit",
			},
			{
				id: "subtitles",
				label: "Adicione legendas chamativas",
				description:
					"A maioria assiste sem som — adicione legendas animadas.",
				icon: TextIcon,
				action: "subtitles",
			},
		],
	},
	{
		id: "podcast",
		title: "Episódio de podcast",
		description: "Grave, limpe e corte trechos de um podcast",
		steps: [
			{
				id: "plan",
				label: "Planeje o episódio",
				description:
					"A IA ajuda a estruturar temas, perguntas e pontos de discussão.",
				icon: SparklesIcon,
				action: "plan-podcast",
			},
			{
				id: "import",
				label: "Importe a gravação",
				description: "Importe a gravação do seu podcast.",
				icon: AiMicIcon,
				action: "import",
			},
			{
				id: "clean",
				label: "Limpe o áudio",
				description:
					"Remova ruídos de fundo e normalize os níveis.",
				icon: SparklesIcon,
				action: "clean-audio",
			},
			{
				id: "transcribe",
				label: "Transcreva e encontre cortes",
				description:
					"Transcreva para navegar facilmente e encontrar os melhores momentos.",
				icon: TextIcon,
				action: "transcribe",
			},
			{
				id: "clip",
				label: "Crie cortes de destaque",
				description:
					"A IA identifica os melhores trechos para cortes de redes sociais.",
				icon: Image01Icon,
				action: "highlights",
			},
		],
	},
];
