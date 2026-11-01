import type { EditorCore } from "@/core";
import { DEFAULT_TEXT_ELEMENT } from "@/constants/text-constants";
import {
	AddTrackCommand,
	InsertElementCommand,
	SplitElementsCommand,
	TracksSnapshotCommand,
	UpdateElementCommand,
} from "@/lib/commands/timeline";
import { BatchCommand } from "@/lib/commands/batch-command";
import {
	captureTranscriptSnapshot,
	hasTranscriptChanged,
	TranscriptSnapshotCommand,
} from "@/lib/commands/transcript";
import { formatClock } from "@/lib/ai-studio-context";
import { openUiDestination, UI_DESTINATIONS } from "@/lib/editor-ui-map";
import { useTranscriptStore } from "@/stores/transcript-store";
import type { TimelineTrack } from "@/types/timeline";

/**
 * Editor actions the studio chat can propose. The model ends its reply with a
 * ```acoes``` JSON block; the chat shows each action as a card and only runs it
 * when the user clicks "Aplicar". Every action is a single undo step.
 */
export type StudioAction =
	| { type: "cortar"; time: number }
	| { type: "remover_trecho"; start: number; end: number }
	| {
			type: "adicionar_texto";
			text: string;
			start: number;
			duration: number;
			position: "topo" | "centro" | "base";
	  }
	| { type: "silenciar" }
	| { type: "formato"; ratio: AspectRatio }
	| { type: "legendar" }
	| { type: "abrir"; destination: string };

type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5";

const RATIO_SIZES: Record<AspectRatio, { width: number; height: number }> = {
	"9:16": { width: 1080, height: 1920 },
	"16:9": { width: 1920, height: 1080 },
	"1:1": { width: 1080, height: 1080 },
	"4:5": { width: 1080, height: 1350 },
};

const MAX_FRAME_REQUESTS = 4;
const EPSILON = 0.01;

export const STUDIO_ACTIONS_PROMPT = `AÇÕES NO EDITOR: você pode propor mudanças que o usuário aplica com um clique na TiêIA. Quando o usuário pedir uma edição, ou quando uma ação resolver um problema que você apontou, termine a resposta com UM bloco assim:
\`\`\`acoes
[{"tipo": "remover_trecho", "inicio": 14.8, "fim": 23.9}]
\`\`\`
Tipos (tempos em segundos da timeline):
- cortar {"tempo"}: divide os clipes nesse ponto.
- remover_trecho {"inicio", "fim"}: apaga o trecho e junta o resto (o que vem depois anda para trás).
- adicionar_texto {"texto", "inicio", "duracao", "posicao": "topo" | "centro" | "base"}: texto na tela.
- silenciar {}: tira o som dos clipes de vídeo e áudio.
- formato {"proporcao": "9:16" | "16:9" | "1:1" | "4:5"}: muda o formato da tela.
- legendar {}: cria legendas a partir da transcrição.
- abrir {"destino"}: quando o usuário perguntar onde fica ou como chegar a um recurso, dê o caminho no texto e use isto com o id do MAPA DA INTERFACE; o botão abre o lugar e aponta o controle.
- ver_quadros {"tempos": [..]}: quando precisar ver um momento com mais detalhe (até ${MAX_FRAME_REQUESTS} tempos). O editor envia esses quadros e você continua a análise; use só isso no bloco nesse caso.
Regras: explique no texto o que cada ação faz e por quê; nunca diga que já aplicou (quem aplica é o usuário); não inclua o bloco se não houver ação.`;

export interface ParsedReply {
	/** Reply without the action block, for display */
	text: string;
	actions: StudioAction[];
	/** Timeline times the model asked to see in detail */
	frameRequests: number[];
}

const BLOCK_RE = /```\s*acoes\s*([\s\S]*?)(```|$)/i;

/** Hide the action block (even half-streamed) from the visible reply. */
export function stripActionBlock(content: string): string {
	const index = content.search(/```\s*acoes/i);
	return (index === -1 ? content : content.slice(0, index)).trimEnd();
}

function toNumber(value: unknown): number | null {
	const number =
		typeof value === "string" ? Number(value.replace(",", ".")) : value;
	return typeof number === "number" && Number.isFinite(number) && number >= 0
		? Math.round(number * 100) / 100
		: null;
}

function normalizeAction(raw: unknown): StudioAction | null {
	if (!raw || typeof raw !== "object") return null;
	const item = raw as Record<string, unknown>;
	const kind = String(item.tipo ?? item.type ?? "")
		.toLowerCase()
		.trim();

	switch (kind) {
		case "cortar": {
			const time = toNumber(item.tempo ?? item.time);
			return time === null ? null : { type: "cortar", time };
		}
		case "remover_trecho": {
			const start = toNumber(item.inicio ?? item.start);
			const end = toNumber(item.fim ?? item.end);
			return start === null || end === null || end <= start
				? null
				: { type: "remover_trecho", start, end };
		}
		case "adicionar_texto": {
			const text = String(item.texto ?? item.text ?? "").trim();
			const start = toNumber(item.inicio ?? item.start) ?? 0;
			const duration = toNumber(item.duracao ?? item.duration) ?? 3;
			const rawPosition = String(item.posicao ?? item.position ?? "centro");
			const position = (["topo", "centro", "base"] as const).find(
				(p) => p === rawPosition,
			);
			if (!text || duration <= 0) return null;
			return {
				type: "adicionar_texto",
				text: text.slice(0, 200),
				start,
				duration,
				position: position ?? "centro",
			};
		}
		case "silenciar":
			return { type: "silenciar" };
		case "formato": {
			const ratio = String(item.proporcao ?? item.ratio ?? "").trim();
			return ratio in RATIO_SIZES
				? { type: "formato", ratio: ratio as AspectRatio }
				: null;
		}
		case "legendar":
			return { type: "legendar" };
		case "abrir": {
			const id = String(item.destino ?? item.destination ?? "").trim();
			return UI_DESTINATIONS.some((d) => d.id === id && (d.tab || d.target))
				? { type: "abrir", destination: id }
				: null;
		}
		default:
			return null;
	}
}

/** Split a finished reply into visible text, proposed actions and frame requests. */
export function parseReply(content: string): ParsedReply {
	const text = stripActionBlock(content);
	const match = content.match(BLOCK_RE);
	if (!match) return { text, actions: [], frameRequests: [] };

	let items: unknown[] = [];
	try {
		const parsed = JSON.parse(match[1].trim());
		items = Array.isArray(parsed) ? parsed : [parsed];
	} catch {
		return { text, actions: [], frameRequests: [] };
	}

	const actions: StudioAction[] = [];
	const frameRequests: number[] = [];
	for (const item of items) {
		const kind = String(
			(item as Record<string, unknown>)?.tipo ??
				(item as Record<string, unknown>)?.type ??
				"",
		).toLowerCase();
		if (kind === "ver_quadros") {
			const times = (item as Record<string, unknown>).tempos;
			for (const value of Array.isArray(times) ? times : []) {
				const time = toNumber(value);
				if (time !== null) frameRequests.push(time);
			}
			continue;
		}
		const action = normalizeAction(item);
		if (action) actions.push(action);
	}
	return {
		text,
		actions,
		frameRequests: [...new Set(frameRequests)].slice(0, MAX_FRAME_REQUESTS),
	};
}

export function describeAction(action: StudioAction): string {
	switch (action.type) {
		case "cortar":
			return `Cortar os clipes em ${formatClock(action.time)}`;
		case "remover_trecho":
			return `Remover o trecho de ${formatClock(action.start)} a ${formatClock(action.end)} (${(action.end - action.start).toFixed(1)} s) e juntar o resto`;
		case "adicionar_texto":
			return `Texto na tela (${action.position}) de ${formatClock(action.start)} a ${formatClock(action.start + action.duration)}: "${action.text}"`;
		case "silenciar":
			return "Tirar o som dos clipes de vídeo e áudio";
		case "formato":
			return `Mudar o formato da tela para ${action.ratio}`;
		case "legendar":
			return "Criar legendas a partir da transcrição";
		case "abrir": {
			const destination = UI_DESTINATIONS.find((d) => d.id === action.destination);
			return `Mostrar onde fica: ${destination?.name ?? action.destination}`;
		}
	}
}

/**
 * After a range [start, end] was removed, move a still-pending action's times
 * to match the new timeline. Returns null when the action pointed inside the cut.
 */
export function shiftActionAfterRemoval(
	action: StudioAction,
	start: number,
	end: number,
): StudioAction | null {
	const cut = end - start;
	const shift = (time: number) =>
		time >= end - EPSILON ? time - cut : time <= start + EPSILON ? time : null;

	switch (action.type) {
		case "cortar": {
			const time = shift(action.time);
			return time === null ? null : { ...action, time };
		}
		case "remover_trecho": {
			const newStart = shift(action.start);
			const newEnd = shift(action.end);
			return newStart === null || newEnd === null || newEnd <= newStart
				? null
				: { ...action, start: newStart, end: newEnd };
		}
		case "adicionar_texto": {
			const newStart = shift(action.start);
			return newStart === null ? null : { ...action, start: newStart };
		}
		default:
			return action;
	}
}

function cloneTracks(tracks: TimelineTrack[]): TimelineTrack[] {
	try {
		return structuredClone(tracks);
	} catch {
		return tracks;
	}
}

/** Run timeline edits without history, then record them as one undo step. */
function applyAsOneStep(editor: EditorCore, run: () => void): void {
	const before = cloneTracks(editor.timeline.getTracks());
	const transcriptBefore = captureTranscriptSnapshot();
	run();
	const after = editor.timeline.getTracks();
	if (JSON.stringify(before) === JSON.stringify(after)) {
		throw new Error("Nada mudou na timeline.");
	}
	const transcriptAfter = captureTranscriptSnapshot();
	const tracksStep = new TracksSnapshotCommand(before, after);
	// A cut also moves the transcript, so both undo together
	editor.command.execute({
		command: hasTranscriptChanged(transcriptBefore, transcriptAfter)
			? new BatchCommand([
					tracksStep,
					new TranscriptSnapshotCommand(transcriptBefore, transcriptAfter),
				])
			: tracksStep,
	});
}

function elementsCrossing(editor: EditorCore, time: number) {
	return editor.timeline
		.getTracks()
		.flatMap((track) =>
			track.elements
				.filter(
					(el) =>
						el.startTime + EPSILON < time &&
						el.startTime + el.duration - EPSILON > time,
				)
				.map((el) => ({ trackId: track.id, elementId: el.id })),
		);
}

function assertWithinTimeline(editor: EditorCore, ...times: number[]) {
	const duration = editor.timeline.getTotalDuration();
	for (const time of times) {
		if (time > duration + EPSILON) {
			throw new Error(
				`${formatClock(time)} passa do fim do vídeo (${formatClock(duration)}).`,
			);
		}
	}
}

/** Keep the transcript aligned with a removed range so later answers use the right times. */
function shiftTranscript(start: number, end: number) {
	const store = useTranscriptStore.getState();
	const cut = end - start;
	const next = store.segments
		.filter((s) => !(s.start >= start - EPSILON && s.end <= end + EPSILON))
		.map((s) => {
			const shift = (t: number) => (t >= end ? t - cut : t > start ? start : t);
			return {
				...s,
				start: shift(s.start),
				end: shift(s.end),
				words: s.words?.map((w) => ({
					...w,
					start: shift(w.start),
					end: shift(w.end),
				})),
			};
		});
	store.setSegments(next);
}

function textPositionY(
	editor: EditorCore,
	position: "topo" | "centro" | "base",
) {
	const height = editor.project.getActive().settings.canvasSize.height;
	return position === "topo"
		? -height * 0.32
		: position === "base"
			? height * 0.24
			: 0;
}

/** Apply one action to the open project. Returns a short confirmation; throws with a readable reason. */
export async function applyStudioAction(
	editor: EditorCore,
	action: StudioAction,
): Promise<string> {
	switch (action.type) {
		case "abrir":
			// Only opens a panel: nothing to undo
			return `Aberto: ${openUiDestination(action.destination).path}`;
		case "cortar": {
			assertWithinTimeline(editor, action.time);
			const elements = elementsCrossing(editor, action.time);
			if (elements.length === 0) {
				throw new Error(`Nenhum clipe passa por ${formatClock(action.time)}.`);
			}
			applyAsOneStep(editor, () => {
				new SplitElementsCommand({
					elements,
					splitTime: action.time,
				}).execute();
			});
			return `Clipes cortados em ${formatClock(action.time)}.`;
		}

		case "remover_trecho": {
			const { start, end } = action;
			assertWithinTimeline(editor, start);
			const cut = end - start;
			applyAsOneStep(editor, () => {
				for (const time of [start, end]) {
					const crossing = elementsCrossing(editor, time);
					if (crossing.length > 0) {
						new SplitElementsCommand({
							elements: crossing,
							splitTime: time,
						}).execute();
					}
				}
				const tracks = editor.timeline.getTracks().map((track) => ({
					...track,
					elements: track.elements
						.filter(
							(el) =>
								!(
									el.startTime >= start - EPSILON &&
									el.startTime + el.duration <= end + EPSILON
								),
						)
						.map((el) =>
							el.startTime >= end - EPSILON
								? { ...el, startTime: Math.max(0, el.startTime - cut) }
								: el,
						),
				})) as TimelineTrack[];
				editor.timeline.updateTracks(tracks);
				shiftTranscript(start, end);
			});
			return `Trecho de ${formatClock(start)} a ${formatClock(end)} removido.`;
		}

		case "adicionar_texto": {
			assertWithinTimeline(editor, action.start);
			const end = action.start + action.duration;
			applyAsOneStep(editor, () => {
				// Reuse a text track that is free in that range, else add one on top
				const freeTrack = editor.timeline
					.getTracks()
					.find(
						(track) =>
							track.type === "text" &&
							track.elements.every(
								(el) =>
									el.startTime >= end - EPSILON ||
									el.startTime + el.duration <= action.start + EPSILON,
							),
					);
				let trackId = freeTrack?.id;
				if (!trackId) {
					const addTrack = new AddTrackCommand("text", 0);
					addTrack.execute();
					trackId = addTrack.getTrackId();
				}
				new InsertElementCommand({
					placement: { mode: "explicit", trackId },
					element: {
						...DEFAULT_TEXT_ELEMENT,
						name: action.text.slice(0, 40),
						content: action.text,
						startTime: action.start,
						duration: action.duration,
						fontSize: 6,
						fontWeight: "bold",
						color: "#ffffff",
						background: {
							...DEFAULT_TEXT_ELEMENT.background,
							enabled: true,
							color: "#000000",
						},
						transform: {
							...DEFAULT_TEXT_ELEMENT.transform,
							position: { x: 0, y: textPositionY(editor, action.position) },
						},
					},
				}).execute();
			});
			return `Texto "${action.text}" adicionado de ${formatClock(action.start)} a ${formatClock(end)}.`;
		}

		case "silenciar": {
			const targets = editor.timeline
				.getTracks()
				.flatMap((track) =>
					track.elements
						.filter(
							(el) =>
								(el.type === "video" || el.type === "audio") &&
								!("muted" in el && el.muted),
						)
						.map((el) => ({ trackId: track.id, elementId: el.id })),
				);
			if (targets.length === 0)
				throw new Error("Não há clipe com som para silenciar.");
			applyAsOneStep(editor, () => {
				for (const target of targets) {
					new UpdateElementCommand({
						...target,
						updates: { muted: true },
					}).execute();
				}
			});
			return `Som tirado de ${targets.length} clipe(s).`;
		}

		case "formato": {
			await editor.project.updateSettings({
				settings: { canvasSize: RATIO_SIZES[action.ratio] },
			});
			return `Formato da tela alterado para ${action.ratio}.`;
		}

		case "legendar": {
			const segments = useTranscriptStore.getState().segments;
			if (segments.length === 0) {
				throw new Error("Transcreva o vídeo antes de criar legendas.");
			}
			const canvasSize = editor.project.getActive().settings.canvasSize;
			applyAsOneStep(editor, () => {
				const addTrack = new AddTrackCommand("text", 0);
				addTrack.execute();
				const trackId = addTrack.getTrackId();
				for (const [index, segment] of segments.entries()) {
					if (!segment.text.trim() || segment.end <= segment.start) continue;
					new InsertElementCommand({
						placement: { mode: "explicit", trackId },
						element: {
							...DEFAULT_TEXT_ELEMENT,
							name: `Legenda ${index + 1}`,
							content: segment.text.trim(),
							startTime: segment.start,
							duration: segment.end - segment.start,
							fontSize: 4,
							fontWeight: "bold",
							color: "#ffffff",
							background: {
								enabled: true,
								color: "#000000",
								cornerRadius: 4,
								paddingX: 12,
								paddingY: 6,
								offsetX: 0,
								offsetY: 0,
							},
							opacity: 0.95,
							transform: {
								scale: 1,
								position: { x: 0, y: canvasSize.height * 0.38 },
								rotate: 0,
							},
						},
					}).execute();
				}
			});
			return `${segments.length} legendas criadas.`;
		}
	}
}
