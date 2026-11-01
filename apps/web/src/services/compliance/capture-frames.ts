import type { EditorCore } from "@/core";
import { getLastFrameTime } from "@/lib/time";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import { buildScene } from "@/services/renderer/scene-builder";

const SHORT_SIDE_PX = 512;
const JPEG_QUALITY = 0.72;

export interface CapturedFrame {
	time: number;
	dataUrl: string;
}

/** How many frames to take: one every `secondsPerFrame`, clamped to [minFrames, maxFrames]. */
export interface FrameDensity {
	secondsPerFrame: number;
	minFrames: number;
	maxFrames: number;
}

export const COMPLIANCE_FRAME_DENSITY: FrameDensity = {
	secondsPerFrame: 3,
	minFrames: 8,
	maxFrames: 12,
};

/** Midpoints of N equal slices, clamped so the last one is never past the final frame. */
export function getComplianceFrameTimes({
	duration,
	fps,
	density = COMPLIANCE_FRAME_DENSITY,
}: {
	duration: number;
	fps: number;
	density?: FrameDensity;
}): number[] {
	const count = Math.min(
		density.maxFrames,
		Math.max(density.minFrames, Math.round(duration / density.secondsPerFrame)),
	);
	const lastFrameTime = getLastFrameTime({ duration, fps });
	return Array.from({ length: count }, (_, index) =>
		Math.min(((index + 0.5) * duration) / count, lastFrameTime),
	);
}

/**
 * Render frames of the composed timeline (text overlays and effects included)
 * as small JPEG data URLs for the compliance check and the studio chat.
 * The TiêIA export watermark stays off so it can't be mistaken for a foreign one.
 */
export async function captureComplianceFrames(
	editor: EditorCore,
	onProgress?: (current: number, total: number) => void,
	density: FrameDensity = COMPLIANCE_FRAME_DENSITY,
): Promise<CapturedFrame[]> {
	const project = editor.project.getActiveOrNull();
	if (!project) throw new Error("Nenhum projeto aberto");
	const duration = editor.timeline.getTotalDuration();
	if (duration <= 0) throw new Error("A timeline está vazia");

	const times = getComplianceFrameTimes({
		duration,
		fps: project.settings.fps,
		density,
	});
	return captureFramesAt(editor, times, onProgress);
}

/** Render the composed timeline at the given times (clamped to the last frame). */
export async function captureFramesAt(
	editor: EditorCore,
	requestedTimes: number[],
	onProgress?: (current: number, total: number) => void,
	shortSidePx: number = SHORT_SIDE_PX,
): Promise<CapturedFrame[]> {
	const project = editor.project.getActiveOrNull();
	if (!project) throw new Error("Nenhum projeto aberto");

	const duration = editor.timeline.getTotalDuration();
	if (duration <= 0) throw new Error("A timeline está vazia");

	const { canvasSize, background, fps } = project.settings;
	const lastFrameTime = getLastFrameTime({ duration, fps });
	const times = requestedTimes.map((time) =>
		Math.min(Math.max(0, time), lastFrameTime),
	);
	const scene = buildScene({
		tracks: editor.timeline.getTracks(),
		mediaAssets: editor.media.getAssets(),
		duration,
		canvasSize,
		background,
	});
	const renderer = new CanvasRenderer({
		width: canvasSize.width,
		height: canvasSize.height,
		fps,
	});

	// renderToCanvas resizes to the target canvas, so size it to the final frame
	const scale = Math.min(
		1,
		shortSidePx / Math.min(canvasSize.width, canvasSize.height),
	);
	const target = document.createElement("canvas");
	target.width = Math.max(1, Math.round(canvasSize.width * scale));
	target.height = Math.max(1, Math.round(canvasSize.height * scale));
	const context = target.getContext("2d");
	if (context) context.imageSmoothingQuality = "high";

	const frames: CapturedFrame[] = [];
	for (const [index, time] of times.entries()) {
		onProgress?.(index + 1, times.length);
		await renderer.renderToCanvas({
			node: scene,
			time,
			targetCanvas: target,
		});
		frames.push({
			time: Math.round(time * 100) / 100,
			dataUrl: target.toDataURL("image/jpeg", JPEG_QUALITY),
		});
	}
	return frames;
}
