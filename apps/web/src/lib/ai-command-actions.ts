import type { StudioAction } from "@/lib/ai-editor-actions";

/** Action as returned by /api/llm/command: `{ type, params, target? }` (snake_case type). */
export interface RawCommandAction {
	type: string;
	params?: Record<string, unknown>;
	description?: string;
}

type TextPosition = "topo" | "centro" | "base";
type Ratio = "9:16" | "16:9" | "1:1" | "4:5";

const RATIOS: readonly Ratio[] = ["9:16", "16:9", "1:1", "4:5"];
const DEFAULT_TEXT_DURATION = 3;

const POSITIONS: Record<string, TextPosition> = {
	top: "topo",
	topo: "topo",
	center: "centro",
	centre: "centro",
	middle: "centro",
	centro: "centro",
	bottom: "base",
	base: "base",
	baixo: "base",
};

function toNumber(value: unknown): number | null {
	const number = typeof value === "string" ? Number(value) : value;
	return typeof number === "number" && Number.isFinite(number) ? number : null;
}

function normalizedType(action: RawCommandAction): string {
	return action.type.trim().toLowerCase();
}

/**
 * Map a command from the LLM to an action the editor can run (`applyStudioAction`).
 * Returns null for commands the editor has no executor for yet.
 */
export function toStudioAction(action: RawCommandAction): StudioAction | null {
	const params = action.params ?? {};

	switch (normalizedType(action)) {
		case "cut":
		case "split":
		case "split_clip": {
			const time = toNumber(params.time);
			return time === null || time < 0 ? null : { type: "cortar", time };
		}

		case "add_text":
		case "add_text_overlay": {
			const text = typeof params.text === "string" ? params.text.trim() : "";
			if (!text) return null;
			const start = toNumber(params.start) ?? toNumber(params.time) ?? 0;
			const duration = toNumber(params.duration) ?? DEFAULT_TEXT_DURATION;
			if (start < 0 || duration <= 0) return null;
			const position =
				typeof params.position === "string"
					? POSITIONS[params.position.trim().toLowerCase()]
					: undefined;
			return {
				type: "adicionar_texto",
				text,
				start,
				duration,
				position: position ?? "base",
			};
		}

		case "remove_segments": {
			const start = toNumber(params.start);
			const end = toNumber(params.end);
			return start === null || end === null || start < 0 || end <= start
				? null
				: { type: "remover_trecho", start, end };
		}

		case "mute":
			return { type: "silenciar" };

		case "set_canvas_size": {
			const ratio = params.ratio ?? params.aspectRatio;
			return RATIOS.includes(ratio as Ratio)
				? { type: "formato", ratio: ratio as Ratio }
				: null;
		}

		default:
			return null;
	}
}

function seconds(value: number): string {
	return `${Number.isInteger(value) ? value : value.toFixed(1)}s`;
}

/** Short Portuguese description of what a command will do, for the confirmation card. */
export function describeCommandAction(action: RawCommandAction): string {
	const studio = toStudioAction(action);
	if (!studio) {
		return action.description?.trim() || "Este tipo de ação ainda não é executado pelo editor.";
	}
	switch (studio.type) {
		case "cortar":
			return `Cortar os clipes em ${seconds(studio.time)}`;
		case "adicionar_texto":
			return `Texto "${studio.text}" aos ${seconds(studio.start)}, por ${seconds(studio.duration)}`;
		case "remover_trecho":
			return `Remover de ${seconds(studio.start)} a ${seconds(studio.end)}`;
		case "silenciar":
			return "Tirar o som dos clipes";
		case "formato":
			return `Mudar o formato da tela para ${studio.ratio}`;
		case "legendar":
			return "Criar legendas a partir da transcrição";
	}
}
