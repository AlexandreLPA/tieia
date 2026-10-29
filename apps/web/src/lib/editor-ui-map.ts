import { type Tab, useAssetsPanelStore } from "@/stores/assets-panel-store";

/**
 * Where each feature lives in the editor, in the words the screen uses. The AI
 * chat gets this map so it can answer "where is X?", and its "Mostrar" button
 * opens the place and points at the control (elements carry data-ui-target).
 */
export interface UiDestination {
	id: string;
	name: string;
	/** Click path, as the user sees it */
	path: string;
	/** What it does, so the chat can match a request to it */
	about: string;
	tab?: Tab;
	subTab?: string;
	/** The data-ui-target to point at once the place is open */
	target?: string;
}

export const UI_DESTINATIONS: UiDestination[] = [
	{
		id: "clonar-voz",
		name: "Clonar voz",
		path: "Barra lateral esquerda → Áudio → Narração → Minhas vozes → Clonar voz",
		about: "grava ou envia 10 a 15 s de fala e cria uma voz clonada (Chatterbox, no PC)",
		tab: "audio",
		subTab: "voiceover",
		target: "voice/clone",
	},
	{
		id: "narracao",
		name: "Narração (texto para fala)",
		path: "Barra lateral esquerda → Áudio → Narração",
		about: "digita um texto e gera a fala com a voz clonada ou uma voz pronta; adiciona à linha do tempo ou baixa em MP3 ou WAV",
		tab: "audio",
		subTab: "voiceover",
		target: "voice/text",
	},
	{
		id: "sons",
		name: "Efeitos sonoros e músicas",
		path: "Barra lateral esquerda → Áudio → Sons",
		about: "efeitos sonoros e músicas para arrastar para a linha do tempo",
		tab: "audio",
		subTab: "sounds",
		target: "audio/sounds",
	},
	{
		id: "podcast",
		name: "Clipes de podcast",
		path: "Barra lateral esquerda → Áudio → Podcast",
		about: "encontra os melhores trechos de um vídeo longo para virar clipes",
		tab: "audio",
		subTab: "podcast",
		target: "audio/podcast",
	},
	{
		id: "midia",
		name: "Mídia (importar arquivos)",
		path: "Barra lateral esquerda → Mídia → Importar",
		about: "importa vídeos, fotos e áudios; o + na miniatura põe na linha do tempo",
		tab: "media",
		target: "tab/media",
	},
	{
		id: "estudio",
		name: "Estúdio de IA",
		path: "Barra lateral esquerda → Estúdio",
		about: "este chat e as ferramentas de IA: roteiro, ideias, B-roll, dublagem, remover fundo, capítulos, reenquadrar",
		tab: "ai",
		target: "tab/ai",
	},
	{
		id: "video-ia",
		name: "Geração de vídeo com IA",
		path: "Barra lateral esquerda → Vídeo IA",
		about: "gera clipes a partir de texto ou imagem (modelos grátis e pagos, com preço por segundo)",
		tab: "videogen",
		target: "tab/videogen",
	},
	{
		id: "texto",
		name: "Texto",
		path: "Barra lateral esquerda → Texto",
		about: "títulos e textos na tela, com estilos (recorte de jornal, gradiente...)",
		tab: "text",
		target: "tab/text",
	},
	{
		id: "gifs",
		name: "GIFs e stickers",
		path: "Barra lateral esquerda → GIFs",
		about: "setas animadas, \"clique aqui\" e reações da KLIPY; arraste para o vídeo",
		tab: "gifs",
		target: "tab/gifs",
	},
	{
		id: "legendas",
		name: "Legendas e transcrição",
		path: "Barra lateral esquerda → Legendas",
		about: "transcreve a fala e cria legendas automáticas; também refaz as legendas",
		tab: "captions",
		target: "tab/captions",
	},
	{
		id: "kit-tiktok",
		name: "Kit TikTok Shop",
		path: "Barra lateral esquerda → Elementos → Kit TikTok Shop",
		about: "elementos prontos para vídeos de venda no TikTok Shop",
		tab: "elements",
		subTab: "tiktok-kit",
		target: "elements/tiktok-kit",
	},
	{
		id: "figurinhas",
		name: "Figurinhas e emojis",
		path: "Barra lateral esquerda → Elementos → Figurinhas",
		about: "figurinhas e emojis para pôr no vídeo",
		tab: "elements",
		subTab: "stickers",
		target: "elements/stickers",
	},
	{
		id: "transicoes",
		name: "Transições",
		path: "Barra lateral esquerda → Visuais → Transições",
		about: "transições entre clipes",
		tab: "visuals",
		subTab: "transitions",
		target: "visuals/transitions",
	},
	{
		id: "efeitos",
		name: "Efeitos visuais",
		path: "Barra lateral esquerda → Visuais → Efeitos",
		about: "efeitos de imagem nos clipes",
		tab: "visuals",
		subTab: "effects",
		target: "visuals/effects",
	},
	{
		id: "filtros",
		name: "Filtros e ajustes de cor",
		path: "Barra lateral esquerda → Visuais → Filtros (ou Ajustes, para brilho, contraste e saturação)",
		about: "filtros de cor e ajustes manuais da imagem",
		tab: "visuals",
		subTab: "filters",
		target: "visuals/filters",
	},
	{
		id: "kit-marca",
		name: "Kit de marca",
		path: "Barra lateral esquerda → Marca",
		about: "cores, fontes, logotipos e sobreposições da marca",
		tab: "brandkit",
		target: "tab/brandkit",
	},
	{
		id: "pesquisa",
		name: "Pesquisa no vídeo",
		path: "Barra lateral esquerda → Pesquisa",
		about: "procura momentos do vídeo pelo que é dito ou mostrado",
		tab: "search",
		target: "tab/search",
	},
	{
		id: "configuracoes",
		name: "Configurações",
		path: "Barra lateral esquerda → Config.",
		about: "ajustes do projeto e da IA, verificação de fatos",
		tab: "settings",
		target: "tab/settings",
	},
	{
		id: "exportar",
		name: "Exportar",
		path: "Botão azul Exportar, no canto superior direito",
		about: "salva o vídeo (formato, resolução, qualidade) e envia ao TikTok; em Formato também baixa só o áudio em M4A, MP3 ou WAV; na seção Áudio fica o volume no padrão das redes (-14 LUFS)",
		target: "header/export",
	},
	{
		id: "pontuacao-viral",
		name: "Pontuação Viral",
		path: "Botão Pontuação Viral, no topo da tela",
		about: "dá nota ao vídeo e confere as regras do TikTok Shop",
		target: "header/viral-score",
	},
	{
		id: "criar-video-ia",
		name: "Criar vídeo com IA",
		path: "Botão Criar vídeo com IA, no topo da tela",
		about: "monta um vídeo inteiro a partir de um tema",
		target: "header/autopilot",
	},
	{
		id: "menu-do-clipe",
		name: "Menu do clipe (botão direito)",
		path: "Clique com o botão direito num clipe da linha do tempo",
		about: "Dividir, Copiar, Silenciar, Separar áudio, Remover silêncios, Ocultar, Duplicar, Excluir; não dá para abrir por aqui, o usuário clica no clipe",
	},
];

/** The map as text for the AI chat's context. */
export function buildUiMapPrompt(): string {
	const lines = UI_DESTINATIONS.map(
		(destination) =>
			`- ${destination.id}: ${destination.name} — ${destination.path}. ${destination.about}.`,
	);
	return `MAPA DA INTERFACE DO OPENCUT (onde fica cada recurso; você conhece a interface por este mapa, não diga que não tem acesso a ela):\n${lines.join("\n")}`;
}

/** Opens the place (tab and sub-tab) and points at its control. */
export function openUiDestination(id: string): UiDestination {
	const destination = UI_DESTINATIONS.find((candidate) => candidate.id === id);
	if (!destination) throw new Error("Não conheço esse lugar da interface.");
	const store = useAssetsPanelStore.getState();
	if (destination.tab) store.setActiveTab(destination.tab);
	if (destination.tab && destination.subTab) store.setSubTab(destination.tab, destination.subTab);
	if (destination.target) store.showUiTarget(destination.target);
	return destination;
}
