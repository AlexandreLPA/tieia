
export const SITE_URL = "http://localhost:3000";

export const SITE_INFO = {
	title: "Passarola",
	description:
		"Editor de vídeo com IA que conta com gerador de clipes de podcast, detecção de múltiplos locutores, legendas estilo karaokê com efeito word-pop, reenquadramento automático para TikTok/Shorts, kits de marca, clonagem de voz e suporte a 22 idiomas indianos via Sarvam AI. 100% local, código aberto, sem nuvem.",
	url: SITE_URL,
	openGraphImage: "/open-graph/default.jpg",
	twitterImage: "/open-graph/default.jpg",
	favicon: "/favicon.svg",
};

export type ExternalTool = {
	name: string;
	description: string;
	url: string;
	logo: string;
};

export const EXTERNAL_TOOLS: ExternalTool[] = [
	{
		name: "Claude (Opus 4.6)",
		description: "O modelo mais capaz da Anthropic. Usado para construir toda a camada de IA da Passarola.",
		url: "https://claude.ai",
		logo: "/logos/tools/claude.png",
	},
	{
		name: "Cursor",
		description: "Editor de código com IA. O IDE usado para desenvolver a Passarola com integração ao Claude.",
		url: "https://cursor.com",
		logo: "/logos/tools/cursor.png",
	},
	{
		name: "Docker",
		description: "Plataforma de containers que roda todos os serviços de IA localmente. Whisper, TTS, Ollama e muito mais.",
		url: "https://docker.com",
		logo: "/logos/tools/docker.png",
	},
	{
		name: "Ollama",
		description: "Executa LLMs localmente. Alimenta comandos de IA, verificação de fatos, edição de roteiro e tradução.",
		url: "https://ollama.com",
		logo: "/logos/tools/ollama.png",
	},
	{
		name: "Coqui TTS",
		description: "Texto para fala (TTS) de código aberto com clonagem de voz. Modelo XTTS v2 para narrações naturais.",
		url: "https://github.com/idiap/coqui-ai-TTS",
		logo: "/logos/tools/coqui.png",
	},
	{
		name: "Faster Whisper",
		description: "Reimplementação do Whisper com CTranslate2. Transcrição local rápida e precisa.",
		url: "https://github.com/SYSTRAN/faster-whisper",
		logo: "/logos/tools/whisper.png",
	},
	{
		name: "Sarvam AI",
		description: "APIs de IA para idiomas indianos. Transcrição, tradução e TTS para 22 idiomas indianos.",
		url: "https://sarvam.ai",
		logo: "/logos/tools/sarvam.png",
	},
];

export const DEFAULT_LOGO_URL = "/logos/opencut/svg/logo.svg";

export const SOCIAL_LINKS = {
	x: "https://x.com/humblefool",
	github: "https://github.com/Ekaanth/OpenCut-AI",
};

/** Link back to the upstream project we forked from */
export const UPSTREAM_URL = "https://github.com/OpenCut-app/OpenCut";

export type Sponsor = {
	name: string;
	url: string;
	logo: string;
	description: string;
	invertOnDark?: boolean;
};

export const SPONSORS: Sponsor[] = [
	{
		name: "Fal.ai",
		url: "https://fal.ai?utm_source=opencut",
		logo: "/logos/others/fal.svg",
		description: "Modelos generativos de imagem, vídeo e áudio, tudo em um só lugar.",
		invertOnDark: true,
	},
	{
		name: "Vercel",
		url: "https://vercel.com?utm_source=opencut",
		logo: "/logos/others/vercel.svg",
		description: "Plataforma onde implantamos e hospedamos o editor.",
		invertOnDark: true,
	},
];
