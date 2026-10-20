import type { ShortcutKey } from "@/types/keybinding";

export type TActionCategory =
	| "playback"
	| "navigation"
	| "editing"
	| "selection"
	| "history"
	| "timeline"
	| "controls"
	| "version"
	| "ai";

export interface TActionDefinition {
	description: string;
	category: TActionCategory;
	defaultShortcuts?: ShortcutKey[];
	args?: Record<string, unknown>;
}

export const ACTIONS = {
	"toggle-play": {
		description: "Reproduzir/Pausar",
		category: "playback",
		defaultShortcuts: ["space", "k"],
	},
	"stop-playback": {
		description: "Parar reprodução",
		category: "playback",
	},
	"seek-forward": {
		description: "Avançar 1 segundo",
		category: "playback",
		defaultShortcuts: ["l"],
		args: { seconds: "number" },
	},
	"seek-backward": {
		description: "Retroceder 1 segundo",
		category: "playback",
		defaultShortcuts: ["j"],
		args: { seconds: "number" },
	},
	"frame-step-forward": {
		description: "Avançar um quadro",
		category: "navigation",
		defaultShortcuts: ["right"],
	},
	"frame-step-backward": {
		description: "Retroceder um quadro",
		category: "navigation",
		defaultShortcuts: ["left"],
	},
	"jump-forward": {
		description: "Avançar 5 segundos",
		category: "navigation",
		defaultShortcuts: ["shift+right"],
		args: { seconds: "number" },
	},
	"jump-backward": {
		description: "Retroceder 5 segundos",
		category: "navigation",
		defaultShortcuts: ["shift+left"],
		args: { seconds: "number" },
	},
	"goto-start": {
		description: "Ir para o início da linha do tempo",
		category: "navigation",
		defaultShortcuts: ["home", "enter"],
	},
	"goto-end": {
		description: "Ir para o fim da linha do tempo",
		category: "navigation",
		defaultShortcuts: ["end"],
	},
	split: {
		description: "Dividir elementos na posição do cursor",
		category: "editing",
		defaultShortcuts: ["s"],
	},
	"split-left": {
		description: "Dividir e remover a parte esquerda",
		category: "editing",
		defaultShortcuts: ["q"],
	},
	"split-right": {
		description: "Dividir e remover a parte direita",
		category: "editing",
		defaultShortcuts: ["w"],
	},
	"delete-selected": {
		description: "Excluir elementos selecionados",
		category: "editing",
		defaultShortcuts: ["backspace", "delete"],
	},
	"copy-selected": {
		description: "Copiar elementos selecionados",
		category: "editing",
		defaultShortcuts: ["ctrl+c"],
	},
	"paste-copied": {
		description: "Colar elementos na posição do cursor",
		category: "editing",
		defaultShortcuts: ["ctrl+v"],
	},
	"toggle-snapping": {
		description: "Ativar/desativar encaixe",
		category: "editing",
		defaultShortcuts: ["n"],
	},
	"toggle-ripple-editing": {
		description: "Ativar/desativar edição em cascata",
		category: "editing",
	},
	"add-marker": {
		description: "Adicionar marcador na posição do cursor",
		category: "timeline",
		defaultShortcuts: ["m"],
	},
	"next-marker": {
		description: "Ir para o próximo marcador",
		category: "navigation",
	},
	"previous-marker": {
		description: "Ir para o marcador anterior",
		category: "navigation",
	},
	"shuttle-forward": {
		description: "Avançar em alta velocidade (pressione L duas vezes = 2x)",
		category: "playback",
	},
	"shuttle-reverse": {
		description: "Retroceder em alta velocidade (pressione J duas vezes = 2x)",
		category: "playback",
	},
	"shuttle-stop": {
		description: "Parar reprodução em alta velocidade",
		category: "playback",
	},
	"ripple-delete": {
		description: "Excluir elementos selecionados (edição em cascata)",
		category: "editing",
	},
	"group-selected": {
		description: "Agrupar itens selecionados",
		category: "editing",
		defaultShortcuts: ["ctrl+g"],
	},
	"ungroup-selected": {
		description: "Desagrupar itens selecionados",
		category: "editing",
		defaultShortcuts: ["ctrl+shift+g"],
	},
	"select-all": {
		description: "Selecionar todos os elementos",
		category: "selection",
		defaultShortcuts: ["ctrl+a"],
	},
	"deselect-all": {
		description: "Desmarcar todos os elementos",
		category: "selection",
		defaultShortcuts: ["escape"],
	},
	"duplicate-selected": {
		description: "Duplicar elemento selecionado",
		category: "selection",
		defaultShortcuts: ["ctrl+d"],
	},
	"toggle-elements-muted-selected": {
		description: "Ativar/desativar mudo nos elementos selecionados",
		category: "selection",
	},
	"toggle-elements-visibility-selected": {
		description: "Mostrar/ocultar elementos selecionados",
		category: "selection",
	},
	"flip-horizontal": {
		description: "Espelhar elementos selecionados na horizontal",
		category: "editing",
	},
	"flip-vertical": {
		description: "Espelhar elementos selecionados na vertical",
		category: "editing",
	},
	"separate-audio": {
		description: "Separar áudio do vídeo",
		category: "editing",
	},
	"freeze-frame": {
		description: "Inserir quadro congelado na posição do cursor",
		category: "editing",
	},
	"toggle-bookmark": {
		description: "Ativar/desativar favorito na posição do cursor",
		category: "timeline",
	},
	"toggle-ai-command-panel": {
		description: "Ativar/desativar painel de comandos de IA",
		category: "controls",
		defaultShortcuts: ["ctrl+k"],
	},
	undo: {
		description: "Desfazer",
		category: "history",
		defaultShortcuts: ["ctrl+z"],
	},
	redo: {
		description: "Refazer",
		category: "history",
		defaultShortcuts: ["ctrl+shift+z", "ctrl+y"],
	},
	"version-commit": {
		description: "Abrir diálogo de commit",
		category: "version",
		defaultShortcuts: ["ctrl+shift+s"],
	},
	"version-history-toggle": {
		description: "Ativar/desativar painel de histórico de versões",
		category: "version",
		defaultShortcuts: ["ctrl+shift+h"],
	},
	"version-diff-working": {
		description: "Mostrar diff das alterações não commitadas",
		category: "version",
		defaultShortcuts: ["ctrl+shift+d"],
	},
	"version-branch-switcher": {
		description: "Abrir seletor de branches",
		category: "version",
		defaultShortcuts: ["ctrl+shift+b"],
	},
	"version-branch-create": {
		description: "Criar branch rapidamente",
		category: "version",
	},
	"open-command-palette": {
		description: "Abrir paleta de comandos",
		category: "controls",
		defaultShortcuts: ["ctrl+shift+p"],
	},
	"check-engagement-score": {
		description: "Verificar pontuação de engajamento",
		category: "ai",
		defaultShortcuts: ["ctrl+shift+e"],
	},
	"add-transition": {
		description: "Adicionar transição entre os clipes selecionados",
		category: "editing",
	},
	"remove-transition": {
		description: "Remover transição do clipe selecionado",
		category: "editing",
	},
	"smart-cut": {
		description: "Remover vícios de linguagem e silêncios em um clique",
		category: "ai",
	},
	"toggle-track-lock": {
		description: "Bloquear/desbloquear faixa selecionada",
		category: "timeline",
	},
	"open-copilot": {
		description: "Abrir agente AI Co-Pilot",
		category: "ai",
	},
	"detect-scenes": {
		description: "Detectar mudanças visuais de cena",
		category: "ai",
	},
	"export-youtube-chapters": {
		description: "Copiar capítulos do YouTube para a área de transferência",
		category: "editing",
	},
	"reorder-tracks": {
		description: "Reordenar faixas arrastando",
		category: "timeline",
	},
	"find-similar-clips": {
		description: "Encontrar clipes visualmente semelhantes à mídia selecionada",
		category: "ai",
	},
} as const satisfies Record<string, TActionDefinition>;

export type TAction = keyof typeof ACTIONS;

export function getActionDefinition({
	action,
}: {
	action: TAction;
}): TActionDefinition {
	return ACTIONS[action];
}

export function getDefaultShortcuts(): Record<ShortcutKey, TAction> {
	const shortcuts: Record<string, TAction> = {};

	for (const [action, def] of Object.entries(ACTIONS) as Array<
		[TAction, TActionDefinition]
	>) {
		if (def.defaultShortcuts) {
			for (const shortcut of def.defaultShortcuts) {
				shortcuts[shortcut] = action;
			}
		}
	}

	return shortcuts as Record<ShortcutKey, TAction>;
}
