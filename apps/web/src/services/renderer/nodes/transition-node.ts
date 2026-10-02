import type { CanvasRenderer } from "../canvas-renderer";
import { createOffscreenCanvas } from "../canvas-utils";
import { BaseNode } from "./base-node";
import { VideoNode } from "./video-node";
import { ImageNode } from "./image-node";
import type { Transform } from "@/types/timeline";
import type { Effect } from "@/types/effects";
import type { BlendMode } from "@/types/rendering";
import type { ElementAnimations } from "@/types/animation";
import { renderTransition } from "../transition-renderer";
import { getTransition } from "@/lib/transitions";
import { getElementKeyframes } from "@/lib/animation";

// Keeps a held frame inside the clip instead of one step past its end
const EDGE_FRAME_S = 1 / 60;

export interface TransitionSourceParams {
	duration: number;
	timeOffset: number;
	trimStart: number;
	trimEnd: number;
	playbackRate?: number;
	transform: Transform;
	animations?: ElementAnimations;
	opacity: number;
	blendMode?: BlendMode;
	effects?: Effect[];
	/** Media backing this side of the transition, if any (video/image only). */
	mediaId?: string;
	mediaType?: "video" | "image";
}

export interface TransitionNodeParams {
	transitionType: string;
	transitionDuration: number;
	cutTime: number;
	sourceA: TransitionSourceParams;
	sourceB: TransitionSourceParams;
	mediaMap: Map<string, { url: string; file?: File }>;
}

export class TransitionNode extends BaseNode<TransitionNodeParams> {
	async render({
		renderer,
		time,
	}: {
		renderer: CanvasRenderer;
		time: number;
	}): Promise<void> {
		const { transitionType, transitionDuration, cutTime } = this.params;
		const halfDuration = transitionDuration / 2;
		const transitionStart = cutTime - halfDuration;
		const transitionEnd = cutTime + halfDuration;

		if (time < transitionStart || time >= transitionEnd) return;

		const progress = (time - transitionStart) / transitionDuration;

		const canvasA = await this.renderSourceFrame({
			renderer,
			...this.extendPastCut({ side: "a", time }),
		});
		const canvasB = await this.renderSourceFrame({
			renderer,
			...this.extendPastCut({ side: "b", time }),
		});

		if (!canvasA || !canvasB) return;

		const definition = getTransition({ transitionType });

		const result = renderTransition({
			sourceA: canvasA,
			sourceB: canvasB,
			width: renderer.width,
			height: renderer.height,
			progress,
			fragmentShader: definition.fragmentShader,
		});

		renderer.context.save();
		renderer.context.globalCompositeOperation = "source-over";
		renderer.context.globalAlpha = 1;
		renderer.context.drawImage(result as CanvasImageSource, 0, 0);
		renderer.context.restore();
	}

	// Each clip ends at the cut, so on its own one side would be blank for half
	// the blend. A keeps playing past the cut and B starts early, using footage
	// the trim hid when there is any, otherwise holding the edge frame.
	private extendPastCut({ side, time }: { side: "a" | "b"; time: number }): {
		sourceParams: TransitionSourceParams;
		time: number;
	} {
		const half = this.params.transitionDuration / 2;

		if (side === "a") {
			const source = this.params.sourceA;
			const rate = source.playbackRate ?? 1;
			const handle = Math.min(half, Math.max(0, source.trimEnd) / rate);
			const duration = source.duration + handle;
			return {
				sourceParams: { ...source, duration },
				time: Math.min(time, source.timeOffset + duration - EDGE_FRAME_S),
			};
		}

		const source = this.params.sourceB;
		const rate = source.playbackRate ?? 1;
		// Shifting the start would also shift keyframes, so animated clips hold
		const handle =
			getElementKeyframes({ animations: source.animations }).length > 0
				? 0
				: Math.min(half, Math.max(0, source.trimStart) / rate);
		const timeOffset = source.timeOffset - handle;
		return {
			sourceParams: {
				...source,
				timeOffset,
				trimStart: source.trimStart - handle * rate,
				duration: source.duration + handle,
			},
			time: Math.max(time, timeOffset),
		};
	}

	private buildContentNode({
		sourceParams,
	}: {
		sourceParams: TransitionSourceParams;
	}): BaseNode | null {
		if (!sourceParams.mediaId || !sourceParams.mediaType) return null;

		const media = this.params.mediaMap.get(sourceParams.mediaId);
		if (!media?.url) return null;

		const shared = {
			duration: sourceParams.duration,
			timeOffset: sourceParams.timeOffset,
			trimStart: sourceParams.trimStart,
			trimEnd: sourceParams.trimEnd,
			playbackRate: sourceParams.playbackRate,
			transform: sourceParams.transform,
			animations: sourceParams.animations,
			opacity: sourceParams.opacity,
			blendMode: sourceParams.blendMode,
			effects: sourceParams.effects,
		};

		if (sourceParams.mediaType === "video") {
			if (!media.file) return null;
			return new VideoNode({
				...shared,
				url: media.url,
				file: media.file,
				mediaId: sourceParams.mediaId,
			});
		}

		return new ImageNode({ ...shared, url: media.url });
	}

	// renders the source clip's frame (respecting transform/trim/effects) into
	// its own offscreen canvas so the transition shader has real pixels to blend
	private async renderSourceFrame({
		renderer,
		sourceParams,
		time,
	}: {
		renderer: CanvasRenderer;
		sourceParams: TransitionSourceParams;
		time: number;
	}): Promise<HTMLCanvasElement | OffscreenCanvas | null> {
		const offscreen = createOffscreenCanvas({
			width: renderer.width,
			height: renderer.height,
		});
		const ctx = offscreen.getContext("2d") as
			| CanvasRenderingContext2D
			| OffscreenCanvasRenderingContext2D
			| null;
		if (!ctx) return null;

		const contentNode = this.buildContentNode({ sourceParams });
		if (!contentNode) return offscreen;

		const originalContext = renderer.context;
		renderer.context = ctx;
		try {
			await contentNode.render({ renderer, time });
		} finally {
			renderer.context = originalContext;
		}

		return offscreen;
	}
}
