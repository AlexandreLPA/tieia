import type { EditorCore } from "@/core";
import type { ElementAnimations, NumberKeyframe } from "@/types/animation";
import { processMediaAssets } from "@/lib/media/processing";
import { generateUUID } from "@/utils/id";
import {
	canvasToPngFile,
	drawArrow,
	drawCircle,
	drawFeedOverlay,
} from "./graphics";
import { audioBufferToWav, renderSfx, SFX_LABELS, type SfxKind } from "./sfx";

/** Saves a generated file as project media and returns its id. */
async function addGeneratedMedia(editor: EditorCore, file: File): Promise<string> {
	const [asset] = await processMediaAssets({ files: [file] });
	if (!asset) throw new Error("Não foi possível processar o arquivo gerado");
	return editor.media.addMediaAsset({
		projectId: editor.project.getActive().metadata.id,
		asset,
	});
}

function numberChannel(points: [time: number, value: number][]) {
	return {
		valueKind: "number" as const,
		keyframes: points.map(
			([time, value]): NumberKeyframe => ({
				id: generateUUID(),
				time: Math.max(0, Math.round(time * 1000) / 1000),
				value,
				interpolation: "linear",
			}),
		),
	};
}

export type HighlightAnimation = "bounce" | "pulse" | "none";

/** Arrow directions as the rotation of a down-pointing arrow (degrees). */
export const ARROW_DIRECTIONS = {
	"↓": 0,
	"↙": 45,
	"←": 90,
	"↖": 135,
	"↑": 180,
	"↗": -135,
	"→": -90,
	"↘": -45,
} as const;
export type ArrowDirection = keyof typeof ARROW_DIRECTIONS;

const HIGHLIGHT_DURATION = 2.5;
const HIGHLIGHT_SCALE = 0.32;

/**
 * Pops in (scale 0 → overshoot → size), then either bounces along the arrow's
 * direction or pulses, for the whole clip.
 */
function highlightAnimations({
	animation,
	rotate,
	position,
	duration,
	canvasHeight,
}: {
	animation: HighlightAnimation;
	rotate: number;
	position: { x: number; y: number };
	duration: number;
	canvasHeight: number;
}): ElementAnimations {
	const scaleKeys: [number, number][] = [
		[0, 0],
		[0.12, HIGHLIGHT_SCALE * 1.18],
		[0.22, HIGHLIGHT_SCALE],
	];
	const channels: ElementAnimations["channels"] = {};

	if (animation === "pulse") {
		for (let t = 0.22; t + 0.5 <= duration; t += 0.5) {
			scaleKeys.push([t + 0.25, HIGHLIGHT_SCALE * 1.1], [t + 0.5, HIGHLIGHT_SCALE]);
		}
	}
	channels["transform.scale"] = numberChannel(scaleKeys);

	if (animation === "bounce") {
		// Move back and forth along the direction the arrow points
		const radians = (rotate * Math.PI) / 180;
		const amplitude = canvasHeight * 0.025;
		const dx = -Math.sin(radians) * amplitude;
		const dy = Math.cos(radians) * amplitude;
		const xKeys: [number, number][] = [[0.22, position.x]];
		const yKeys: [number, number][] = [[0.22, position.y]];
		for (let t = 0.22; t + 0.6 <= duration; t += 0.6) {
			xKeys.push([t + 0.3, position.x + dx], [t + 0.6, position.x]);
			yKeys.push([t + 0.3, position.y + dy], [t + 0.6, position.y]);
		}
		channels["transform.position.x"] = numberChannel(xKeys);
		channels["transform.position.y"] = numberChannel(yKeys);
	}

	return { channels };
}

export async function insertHighlight({
	editor,
	kind,
	direction = "↓",
	animation,
}: {
	editor: EditorCore;
	kind: "arrow" | "circle";
	direction?: ArrowDirection;
	animation: HighlightAnimation;
}): Promise<void> {
	const canvas = kind === "arrow" ? drawArrow() : drawCircle();
	const file = await canvasToPngFile(
		canvas,
		kind === "arrow" ? "seta-vermelha.png" : "circulo-vermelho.png",
	);
	const mediaId = await addGeneratedMedia(editor, file);

	const { canvasSize } = editor.project.getActive().settings;
	const rotate = kind === "arrow" ? ARROW_DIRECTIONS[direction] : 0;
	// A little above center, where products usually are; drag to place it
	const position = { x: 0, y: -canvasSize.height * 0.08 };
	const startTime = editor.playback.getCurrentTime();

	editor.timeline.insertElement({
		element: {
			type: "image",
			mediaId,
			name: kind === "arrow" ? `Seta ${direction}` : "Círculo",
			startTime,
			duration: HIGHLIGHT_DURATION,
			trimStart: 0,
			trimEnd: 0,
			transform: { scale: HIGHLIGHT_SCALE, position, rotate },
			opacity: 1,
			animations: highlightAnimations({
				animation,
				rotate,
				position,
				duration: HIGHLIGHT_DURATION,
				canvasHeight: canvasSize.height,
			}),
		},
		placement: { mode: "auto" },
	});
}

/** Generic feed UI over the whole video, on its own top track. */
export async function insertFeedOverlay(editor: EditorCore): Promise<void> {
	const { canvasSize } = editor.project.getActive().settings;
	const file = await canvasToPngFile(
		drawFeedOverlay({ width: canvasSize.width, height: canvasSize.height }),
		"interface-feed.png",
	);
	const mediaId = await addGeneratedMedia(editor, file);
	const duration = Math.max(1, editor.timeline.getTotalDuration());
	const trackId = editor.timeline.addTrack({ type: "video", index: 0 });
	editor.timeline.renameTrack({ trackId, name: "Interface do feed" });
	editor.timeline.insertElement({
		element: {
			type: "image",
			mediaId,
			name: "Interface do feed",
			startTime: 0,
			duration,
			trimStart: 0,
			trimEnd: 0,
			transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
			opacity: 1,
		},
		placement: { mode: "explicit", trackId },
	});
}

const sfxCache = new Map<SfxKind, Promise<AudioBuffer>>();
export function getSfxBuffer(kind: SfxKind): Promise<AudioBuffer> {
	let buffer = sfxCache.get(kind);
	if (!buffer) {
		buffer = renderSfx(kind);
		sfxCache.set(kind, buffer);
	}
	return buffer;
}

export async function insertSfx({
	editor,
	kind,
}: {
	editor: EditorCore;
	kind: SfxKind;
}): Promise<void> {
	const buffer = await getSfxBuffer(kind);
	const file = new File(
		[audioBufferToWav(buffer)],
		`sfx-${kind}.wav`,
		{ type: "audio/wav" },
	);
	const mediaId = await addGeneratedMedia(editor, file);
	editor.timeline.insertElement({
		element: {
			type: "audio",
			sourceType: "upload",
			mediaId,
			name: SFX_LABELS[kind].name,
			startTime: editor.playback.getCurrentTime(),
			duration: buffer.duration,
			trimStart: 0,
			trimEnd: 0,
			sourceDuration: buffer.duration,
			volume: 1,
		},
		placement: { mode: "auto" },
	});
}

export type ZoomStyle = "punch" | "smooth" | "in-out";

/**
 * Zoom on the selected clip from the playhead: "punch" jumps in (a hard
 * cut-zoom like CapCut's 135%), "smooth" eases in over 0.6 s, "in-out" goes in
 * and back out over 1.2 s.
 */
export function applyZoom({
	editor,
	style,
	amount = 1.35,
}: {
	editor: EditorCore;
	style: ZoomStyle;
	amount?: number;
}): { ok: true } | { ok: false; reason: string } {
	const [selected] = editor.selection.getSelectedElements();
	if (!selected) return { ok: false, reason: "Selecione um clipe de vídeo ou imagem" };
	const [match] = editor.timeline.getElementsWithTracks({ elements: [selected] });
	const element = match?.element;
	if (!element || (element.type !== "video" && element.type !== "image")) {
		return { ok: false, reason: "Selecione um clipe de vídeo ou imagem" };
	}

	const local = Math.min(
		Math.max(0, editor.playback.getCurrentTime() - element.startTime),
		Math.max(0, element.duration - 0.1),
	);
	const base = element.transform.scale;
	const target = base * amount;
	const points: [number, number][] =
		style === "punch"
			? [[Math.max(0, local - 0.001), base], [local, target]]
			: style === "smooth"
				? [[local, base], [local + 0.6, target]]
				: [[local, base], [local + 0.4, target], [local + 0.8, target], [local + 1.2, base]];

	const existing = element.animations?.channels ?? {};
	const previous = existing["transform.scale"];
	const keyframes = [
		...(previous?.valueKind === "number"
			? previous.keyframes.filter(
					(k) => k.time < points[0][0] - 0.01 || k.time > points[points.length - 1][0] + 0.01,
				)
			: []),
		...numberChannel(points).keyframes,
	].sort((a, b) => a.time - b.time);

	editor.timeline.updateElements({
		updates: [
			{
				trackId: match.track.id,
				elementId: element.id,
				updates: {
					animations: {
						channels: {
							...existing,
							"transform.scale": { valueKind: "number", keyframes },
						},
					},
				},
			},
		],
	});
	return { ok: true };
}
