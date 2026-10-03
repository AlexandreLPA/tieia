import type { CanvasRenderer } from "../canvas-renderer";
import { resolveStickerId } from "@/lib/stickers";
import { VisualNode, type VisualNodeParams } from "./visual-node";
import {
	type AnimatedImage,
	frameAt,
	loadAnimatedImage,
} from "../animated-image";

export interface StickerNodeParams extends VisualNodeParams {
	stickerId: string;
}

interface CachedStickerSource {
	source: HTMLImageElement;
	width: number;
	height: number;
}

const stickerSourceCache = new Map<string, Promise<CachedStickerSource>>();

function loadStickerSource(stickerId: string): Promise<CachedStickerSource> {
	const cached = stickerSourceCache.get(stickerId);
	if (cached) return cached;

	const promise = (async (): Promise<CachedStickerSource> => {
		const url = resolveStickerId({
			stickerId,
			options: { width: 200, height: 200 },
		});

		const image = new Image();
		// Remote stickers (e.g. KLIPY) must not taint the canvas used for export
		image.crossOrigin = "anonymous";

		await new Promise<void>((resolve, reject) => {
			image.onload = () => resolve();
			image.onerror = () =>
				reject(new Error(`Failed to load sticker: ${stickerId}`));
			image.src = url;
		});

		// Icon SVGs are requested at 200 px; remote stickers keep their own ratio
		return {
			source: image,
			width: image.naturalWidth || 200,
			height: image.naturalHeight || 200,
		};
	})();

	stickerSourceCache.set(stickerId, promise);
	return promise;
}

export class StickerNode extends VisualNode<StickerNodeParams> {
	private cachedSource: Promise<CachedStickerSource>;
	private animated: Promise<AnimatedImage | null>;

	constructor(params: StickerNodeParams) {
		super(params);
		this.cachedSource = loadStickerSource(params.stickerId);
		this.animated = this.cachedSource
			.then(({ source }) => loadAnimatedImage(source.src))
			.catch(() => null);
	}

	async render({ renderer, time }: { renderer: CanvasRenderer; time: number }) {
		await super.render({ renderer, time });

		if (!this.isInRange({ time })) {
			return;
		}

		const animation = await this.animated;
		if (animation) {
			this.renderVisual({
				renderer,
				source: frameAt(
					animation,
					time - this.params.timeOffset + this.params.trimStart,
				),
				sourceWidth: animation.width,
				sourceHeight: animation.height,
				timelineTime: time,
			});
			return;
		}

		const { source, width, height } = await this.cachedSource;

		this.renderVisual({
			renderer,
			source,
			sourceWidth: width,
			sourceHeight: height,
			timelineTime: time,
		});
	}
}
