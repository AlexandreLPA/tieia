import type { EditorAction } from "@/types/ai";

export type CopilotStepStatus =
	| "pending"
	| "running"
	| "completed"
	| "error"
	| "cancelled";

export interface CopilotStep {
	id: string;
	description: string;
	action?: EditorAction;
	customExecute?: string;
	status: CopilotStepStatus;
	error?: string;
	result?: string;
}

export interface CopilotPlan {
	goal: string;
	steps: CopilotStep[];
	estimatedTime: string;
	requiresConfirmation: boolean;
}

export interface CopilotExecutionOptions {
	autoExecute: boolean;
	delayBetweenSteps: number;
	onStepComplete?: (step: CopilotStep) => void;
	onStepError?: (step: CopilotStep, error: Error) => void;
	onComplete?: (plan: CopilotPlan) => void;
}

export const COPILOT_PRESETS = [
	{
		label: "Criar um reel de 60s",
		prompt:
			"Transforme isso em um reel vertical de 60 segundos com legendas e música de fundo. Corte para a parte mais envolvente.",
	},
	{
		label: "Remover silêncios",
		prompt:
			"Remova todos os silêncios e vícios de linguagem deste vídeo. Limpe o áudio.",
	},
	{
		label: "Adicionar capítulos",
		prompt:
			"Analise o conteúdo e adicione marcadores de capítulo nas mudanças de assunto. Gere a descrição para o YouTube.",
	},
	{
		label: "Clipes para redes sociais",
		prompt:
			"Encontre os 3 melhores clipes curtos (15 a 30 segundos cada) deste vídeo e crie intervalos separados na linha do tempo para eles.",
	},
	{
		label: "Aprimorar áudio",
		prompt:
			"Normalize o áudio para -14 LUFS para o YouTube. Aplique redução de ruído. Reduza automaticamente a música de fundo durante a fala.",
	},
	{
		label: "Correção de cor",
		prompt:
			"Aplique correção de cor cinematográfica em todos os clipes de vídeo. Adicione uma vinheta sutil. Deixe os tons de pele quentes e naturais.",
	},
] as const;

export const COPILOT_SYSTEM_PROMPT = `You are an AI video editing assistant. Given a user's goal and the current project state, create a step-by-step editing plan.

Return a JSON object with this exact structure:
{
  "steps": [
    {
      "id": "step-1",
      "description": "Human-readable description of what this step does",
      "action": {
        "type": "EDITOR_ACTION_TYPE",
        "params": { ... },
        "description": "What this action does"
      }
    }
  ],
  "estimatedTime": "estimated time to complete all steps",
  "requiresConfirmation": true
}

Available action types:
- REMOVE_SEGMENTS: { segmentIds: number[] }
- REMOVE_FILLERS: { fillerWords: string[] }
- REMOVE_SILENCE: { threshold: number }
- ADD_CHAPTER_MARKERS: { chapters: { title: string, start: number, end: number, summary?: string }[] }
- ADD_SUBTITLE_TRACK: { preset: string, language: string }
- ADD_IMAGE_OVERLAY: { prompt: string, x: number, y: number }
- TRIM_CLIP: { start: number, end: number }
- ADD_TRANSITION: { transitionType: string, duration: number }
- SPLIT_CLIP: { time: number }
- ADD_TEXT_OVERLAY: { text: string, x: number, y: number, style: string }
- ADJUST_SPEED: { speed: number, clipId?: string }
- ADD_VOICEOVER: { text: string, voiceId?: string }
- DENOISE_AUDIO: { strength: number }
- GENERATE_IMAGE: { prompt: string, width: number, height: number }
- SET_CANVAS_SIZE: { width: number, height: number, label: string }
- ADD_MUSIC: { genre: string, mood: string, tempo: string, duration: number }
- NORMALIZE_AUDIO: { targetLUFS: number }
- AUTO_DUCK: { duckAmount: number, fadeDuration: number }
- EXPORT_PROJECT: { format: string, quality: string }
- COLOR_CORRECT: { profile: string }

Only include action types from the list above. Be specific with params. Always set requiresConfirmation to true for destructive operations (REMOVE_*, TRIM_CLIP, SPLIT_CLIP).`;
