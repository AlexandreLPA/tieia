/**
 * Chunk planning for TikTok's FILE_UPLOAD media transfer.
 *
 * Rules (https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide):
 * - every chunk is at least 5 MB and at most 64 MB, except the last one;
 * - the last chunk absorbs the trailing bytes and may reach 128 MB;
 * - a video under 5 MB goes up whole, in a single chunk;
 * - total_chunk_count = floor(video_size / chunk_size), between 1 and 1000;
 * - chunks go up one after the other, never in parallel.
 *
 * The doc doesn't say whether "MB" means 10^6 or 2^20 bytes, so the limits
 * below satisfy both readings: the floor uses MiB, the ceilings use MB.
 */

export const MIN_CHUNK_SIZE = 5 * 1024 * 1024;
export const MAX_CHUNK_SIZE = 64 * 1000 * 1000;
export const MAX_FINAL_CHUNK_SIZE = 128 * 1000 * 1000;
export const MAX_CHUNK_COUNT = 1000;
/** Small enough for useful progress, big enough to keep the request count low. */
export const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024;

export interface ChunkPlan {
	videoSize: number;
	chunkSize: number;
	totalChunkCount: number;
}

export interface ChunkRange {
	index: number;
	/** First byte, inclusive. */
	start: number;
	/** Last byte, inclusive (Content-Range style). */
	end: number;
	size: number;
}

export function planChunks({
	videoSize,
	preferredChunkSize = DEFAULT_CHUNK_SIZE,
}: {
	videoSize: number;
	preferredChunkSize?: number;
}): ChunkPlan {
	if (!Number.isSafeInteger(videoSize) || videoSize <= 0) {
		throw new Error(`Invalid video size: ${videoSize}`);
	}

	const whole = { videoSize, chunkSize: videoSize, totalChunkCount: 1 };
	if (videoSize < MIN_CHUNK_SIZE) return whole;

	let chunkSize = Math.min(
		Math.max(Math.floor(preferredChunkSize), MIN_CHUNK_SIZE),
		MAX_CHUNK_SIZE,
	);

	if (Math.floor(videoSize / chunkSize) <= 1) {
		// Fits in one chunk: send it whole, like the doc's single-chunk example.
		if (videoSize <= MAX_CHUNK_SIZE) return whole;
		// Over 64 MB needs at least two chunks; halves stay within 32–64 MB.
		chunkSize = Math.floor(videoSize / 2);
	}

	if (Math.floor(videoSize / chunkSize) > MAX_CHUNK_COUNT) {
		chunkSize = Math.ceil(videoSize / MAX_CHUNK_COUNT);
	}
	if (chunkSize > MAX_CHUNK_SIZE) {
		throw new Error(`Video too large for chunked upload: ${videoSize} bytes`);
	}

	return {
		videoSize,
		chunkSize,
		totalChunkCount: Math.floor(videoSize / chunkSize),
	};
}

export function getChunkRange({
	plan,
	index,
}: {
	plan: ChunkPlan;
	index: number;
}): ChunkRange | null {
	if (!Number.isInteger(index) || index < 0 || index >= plan.totalChunkCount) {
		return null;
	}
	const start = index * plan.chunkSize;
	const isLast = index === plan.totalChunkCount - 1;
	const end = isLast ? plan.videoSize - 1 : start + plan.chunkSize - 1;
	return { index, start, end, size: end - start + 1 };
}

export function getChunkRanges(plan: ChunkPlan): ChunkRange[] {
	return Array.from(
		{ length: plan.totalChunkCount },
		(_, index) => getChunkRange({ plan, index }) as ChunkRange,
	);
}

export function formatContentRange({
	range,
	videoSize,
}: {
	range: ChunkRange;
	videoSize: number;
}): string {
	return `bytes ${range.start}-${range.end}/${videoSize}`;
}

/** Throws if a plan breaks one of TikTok's rules. */
export function assertValidPlan(plan: ChunkPlan): void {
	const ranges = getChunkRanges(plan);
	if (ranges.length < 1 || ranges.length > MAX_CHUNK_COUNT) {
		throw new Error(`Chunk count out of range: ${ranges.length}`);
	}
	if (plan.totalChunkCount !== Math.floor(plan.videoSize / plan.chunkSize)) {
		throw new Error("total_chunk_count must be floor(video_size / chunk_size)");
	}
	if (ranges.length === 1) {
		if (plan.chunkSize !== plan.videoSize) {
			throw new Error("A single chunk must carry the whole video");
		}
		if (plan.videoSize > MAX_CHUNK_SIZE) {
			throw new Error("Videos over 64 MB must go up in several chunks");
		}
		return;
	}
	if (plan.chunkSize < MIN_CHUNK_SIZE || plan.chunkSize > MAX_CHUNK_SIZE) {
		throw new Error(`Chunk size out of range: ${plan.chunkSize}`);
	}
	const last = ranges[ranges.length - 1];
	if (last.size > MAX_FINAL_CHUNK_SIZE) {
		throw new Error(`Final chunk too large: ${last.size}`);
	}
}

export type ChunkSendResult =
	| { kind: "partial" }
	| { kind: "complete" }
	| { kind: "retry"; message: string }
	| { kind: "error"; message: string };

/**
 * Sends the chunks in order, one at a time. `sendChunk` does the transport
 * (our API route in the browser, a fake in tests). Server errors are retried
 * on the same chunk, as the media transfer guide says.
 */
export async function uploadChunksSequentially({
	plan,
	sendChunk,
	onProgress,
	maxRetries = 3,
	retryDelayMs = 1000,
	signal,
}: {
	plan: ChunkPlan;
	sendChunk: (range: ChunkRange) => Promise<ChunkSendResult>;
	onProgress?: (progress: {
		uploadedBytes: number;
		videoSize: number;
		chunkIndex: number;
		totalChunkCount: number;
	}) => void;
	maxRetries?: number;
	/** Wait before retry n is n × this. */
	retryDelayMs?: number;
	signal?: AbortSignal;
}): Promise<void> {
	const ranges = getChunkRanges(plan);
	let uploadedBytes = 0;

	for (const range of ranges) {
		const isLast = range.index === ranges.length - 1;
		let attempt = 0;
		for (;;) {
			if (signal?.aborted) throw new Error("Envio cancelado");
			const result = await sendChunk(range);
			if (result.kind === "retry" && attempt < maxRetries) {
				attempt++;
				if (retryDelayMs > 0) {
					await new Promise((resolve) =>
						setTimeout(resolve, retryDelayMs * attempt),
					);
				}
				continue;
			}
			if (result.kind === "retry" || result.kind === "error") {
				throw new Error(result.message);
			}
			if (result.kind === "complete" && !isLast) {
				throw new Error(
					`TikTok closed the upload after chunk ${range.index + 1} of ${ranges.length}`,
				);
			}
			if (result.kind === "partial" && isLast) {
				throw new Error("TikTok expected more data after the last chunk");
			}
			break;
		}
		uploadedBytes += range.size;
		onProgress?.({
			uploadedBytes,
			videoSize: plan.videoSize,
			chunkIndex: range.index,
			totalChunkCount: plan.totalChunkCount,
		});
	}
}
