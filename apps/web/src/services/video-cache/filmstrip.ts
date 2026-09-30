import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";

// Tall enough to stay sharp on HiDPI timeline tracks, small enough to decode fast
const THUMB_HEIGHT_PX = 96;
const TIME_STEP_S = 0.1;
const JPEG_QUALITY = 0.7;
// Lets tiles that mount together be decoded in one sorted pass
const BATCH_DELAY_MS = 30;

type SinkEntry = { sink: CanvasSink; duration: number } | null;
type Resolve = (url: string | null) => void;

async function canvasToUrl(
	canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<string | null> {
	const blob =
		"convertToBlob" in canvas
			? await canvas.convertToBlob({
					type: "image/jpeg",
					quality: JPEG_QUALITY,
				})
			: await new Promise<Blob | null>((resolve) =>
					canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
				);
	return blob ? URL.createObjectURL(blob) : null;
}

/**
 * Frame thumbnails for the timeline filmstrip. Separate from the playback
 * VideoCache so scrolling the timeline never competes with the preview.
 */
class FilmstripCache {
	private sinks = new Map<string, Promise<SinkEntry>>();
	private frames = new Map<string, string>();
	private queues = new Map<string, Map<number, Resolve[]>>();
	private draining = new Set<string>();

	private bucket(time: number): number {
		return Math.max(0, Math.round(time / TIME_STEP_S) * TIME_STEP_S);
	}

	private key(mediaId: string, bucket: number): string {
		return `${mediaId}|${bucket.toFixed(1)}`;
	}

	/** Already-decoded thumbnail for this moment, if any. */
	peek(mediaId: string, time: number): string | undefined {
		return this.frames.get(this.key(mediaId, this.bucket(time)));
	}

	request({
		mediaId,
		file,
		time,
	}: {
		mediaId: string;
		file: File;
		time: number;
	}): Promise<string | null> {
		const bucket = this.bucket(time);
		const cached = this.frames.get(this.key(mediaId, bucket));
		if (cached) return Promise.resolve(cached);

		return new Promise((resolve) => {
			const queue = this.queues.get(mediaId) ?? new Map<number, Resolve[]>();
			this.queues.set(mediaId, queue);
			queue.set(bucket, [...(queue.get(bucket) ?? []), resolve]);
			if (!this.draining.has(mediaId)) {
				this.draining.add(mediaId);
				setTimeout(() => this.drain(mediaId, file), BATCH_DELAY_MS);
			}
		});
	}

	private getSink(mediaId: string, file: File): Promise<SinkEntry> {
		let entry = this.sinks.get(mediaId);
		if (!entry) {
			entry = (async () => {
				try {
					const input = new Input({
						source: new BlobSource(file),
						formats: ALL_FORMATS,
					});
					const track = await input.getPrimaryVideoTrack();
					if (!track || !(await track.canDecode())) return null;
					const duration = await input.computeDuration();
					const sink = new CanvasSink(track, {
						height: THUMB_HEIGHT_PX,
						poolSize: 2,
					});
					return { sink, duration };
				} catch (error) {
					console.warn("Filmstrip: could not open video", error);
					return null;
				}
			})();
			this.sinks.set(mediaId, entry);
		}
		return entry;
	}

	private async drain(mediaId: string, file: File): Promise<void> {
		try {
			const entry = await this.getSink(mediaId, file);
			while ((this.queues.get(mediaId)?.size ?? 0) > 0) {
				const batch = [
					...(this.queues.get(mediaId) ?? new Map()).entries(),
				].sort((a, b) => a[0] - b[0]);
				this.queues.set(mediaId, new Map());
				if (!entry) {
					for (const [, waiters] of batch)
						for (const resolve of waiters) resolve(null);
					continue;
				}

				const lastTime = Math.max(0, entry.duration - 0.05);
				const times = batch.map(([bucket]) => Math.min(bucket, lastTime));
				let index = 0;
				for await (const wrapped of entry.sink.canvasesAtTimestamps(times)) {
					const [bucket, waiters] = batch[index++];
					// Pool canvases get reused, so encode before asking for the next one
					const url = wrapped ? await canvasToUrl(wrapped.canvas) : null;
					if (url) this.frames.set(this.key(mediaId, bucket), url);
					for (const resolve of waiters) resolve(url);
				}
				for (; index < batch.length; index++) {
					for (const resolve of batch[index][1]) resolve(null);
				}
			}
		} catch (error) {
			console.warn("Filmstrip: decoding failed", error);
			for (const waiters of this.queues.get(mediaId)?.values() ?? []) {
				for (const resolve of waiters) resolve(null);
			}
			this.queues.set(mediaId, new Map());
		} finally {
			this.draining.delete(mediaId);
			// Requests that arrived while the last batch was finishing
			if ((this.queues.get(mediaId)?.size ?? 0) > 0) {
				this.draining.add(mediaId);
				setTimeout(() => this.drain(mediaId, file), BATCH_DELAY_MS);
			}
		}
	}
}

export const filmstripCache = new FilmstripCache();
