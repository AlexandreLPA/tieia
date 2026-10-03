/**
 * Animated GIF/WebP support for the renderer. A plain <img> drawn to a canvas
 * only ever gives one frame, so animated stickers froze; here every frame is
 * decoded once (WebCodecs ImageDecoder) and picked by time, looping.
 */

export interface AnimatedFrame {
	bitmap: ImageBitmap;
	/** Start within one loop, in seconds */
	start: number;
}

export interface AnimatedImage {
	frames: AnimatedFrame[];
	loopDuration: number;
	width: number;
	height: number;
}

// Keeps memory bounded for long GIFs; later frames are dropped
const MAX_FRAMES = 300;
// Some GIFs declare 0 ms frames; browsers treat those as ~100 ms
const MIN_FRAME_SECONDS = 0.02;
const FALLBACK_FRAME_SECONDS = 0.1;

const ANIMATABLE_TYPES = new Set(["image/gif", "image/webp", "image/apng", "image/png"]);

const cache = new Map<string, Promise<AnimatedImage | null>>();

function supportsImageDecoder(): boolean {
	return typeof globalThis !== "undefined" && "ImageDecoder" in globalThis;
}

async function decode(url: string): Promise<AnimatedImage | null> {
	if (!supportsImageDecoder()) return null;

	const response = await fetch(url);
	if (!response.ok) return null;
	const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
	if (!ANIMATABLE_TYPES.has(type)) return null;
	const data = await response.arrayBuffer();

	// Not in every TS lib yet
	const Decoder = (globalThis as unknown as {
		ImageDecoder: new (init: { data: ArrayBuffer; type: string }) => {
			tracks: { ready: Promise<void>; selectedTrack: { frameCount: number; animated: boolean } | null };
			decode: (options: { frameIndex: number }) => Promise<{ image: VideoFrame }>;
			close: () => void;
		};
	}).ImageDecoder;
	const decoder = new Decoder({ data, type });
	try {
		await decoder.tracks.ready;
		const track = decoder.tracks.selectedTrack;
		if (!track?.animated || track.frameCount < 2) return null;

		const count = Math.min(track.frameCount, MAX_FRAMES);
		const frames: AnimatedFrame[] = [];
		let start = 0;
		let width = 0;
		let height = 0;
		for (let frameIndex = 0; frameIndex < count; frameIndex++) {
			const { image } = await decoder.decode({ frameIndex });
			const seconds = image.duration ? image.duration / 1_000_000 : FALLBACK_FRAME_SECONDS;
			width = image.displayWidth;
			height = image.displayHeight;
			const bitmap = await createImageBitmap(image);
			image.close();
			frames.push({ bitmap, start });
			start += Math.max(MIN_FRAME_SECONDS, seconds);
		}
		return { frames, loopDuration: start, width, height };
	} finally {
		decoder.close();
	}
}

/** Decoded frames for an animated image URL, or null when it's still/unsupported. */
export function loadAnimatedImage(url: string): Promise<AnimatedImage | null> {
	let entry = cache.get(url);
	if (!entry) {
		entry = decode(url).catch((error) => {
			console.warn("Animated image decode failed:", error);
			return null;
		});
		cache.set(url, entry);
	}
	return entry;
}

/** The frame showing `elapsed` seconds into the element, looping. */
export function frameAt(animation: AnimatedImage, elapsed: number): ImageBitmap {
	const t = ((elapsed % animation.loopDuration) + animation.loopDuration) % animation.loopDuration;
	const { frames } = animation;
	// Binary search for the last frame starting at or before t
	let low = 0;
	let high = frames.length - 1;
	while (low < high) {
		const mid = (low + high + 1) >> 1;
		if (frames[mid].start <= t) low = mid;
		else high = mid - 1;
	}
	return frames[low].bitmap;
}
