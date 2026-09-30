import type { EditorCore } from "@/core";
import { getLastFrameTime } from "@/lib/time";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import { buildScene } from "@/services/renderer/scene-builder";

const SECONDS_PER_FRAME = 3;
const MIN_FRAMES = 8;
const MAX_FRAMES = 12;
const SHORT_SIDE_PX = 512;
const JPEG_QUALITY = 0.72;

export interface CapturedFrame {
	time: number;
	dataUrl: string;
}

/** Midpoints of N equal slices, clamped so the last one is never past the final frame. */
export function getComplianceFrameTimes({
	duration,
	fps,
}: {
	duration: number;
	fps: number;
}): number[] {
	const count = Math.min(
		MAX_FRAMES,
		Math.max(MIN_FRAMES, Math.round(duration / SECONDS_PER_FRAME)),
	);
	const lastFrameTime = getLastFrameTime({ duration, fps });
	return Array.from({ length: count }, (_, index) =>
		Math.min(((index + 0.5) * duration) / count, lastFrameTime),
	);
}

/**
 * Render frames of the composed timeline (text overlays and effects included)
 * as small JPEG data URLs for the compliance check.
 * The OpenCut export watermark stays off so it can't be mistaken for a foreign one.
 */
export async function captureComplianceFrames(
	editor: EditorCore,
	onProgress?: (current: number, total: number) => void,
): Promise<CapturedFrame[]> {
	const project = editor.project.getActiveOrNull();
	if (!project) throw new Error("Nenhum projeto aberto");

	const duration = editor.timeline.getTotalDuration();
	if (duration <= 0) throw new Error("A timeline está vazia");

	const { canvasSize, background, fps } = project.settings;
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
		SHORT_SIDE_PX / Math.min(canvasSize.width, canvasSize.height),
	);
	const target = document.createElement("canvas");
	target.width = Math.max(1, Math.round(canvasSize.width * scale));
	target.height = Math.max(1, Math.round(canvasSize.height * scale));
	const context = target.getContext("2d");
	if (context) context.imageSmoothingQuality = "high";

	const times = getComplianceFrameTimes({ duration, fps });
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
