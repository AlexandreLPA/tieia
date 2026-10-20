import { describe, expect, test } from "bun:test";
import {
	MAX_CHUNK_SIZE,
	MAX_FINAL_CHUNK_SIZE,
	MIN_CHUNK_SIZE,
	type ChunkRange,
	type ChunkSendResult,
	assertValidPlan,
	formatContentRange,
	getChunkRanges,
	planChunks,
	uploadChunksSequentially,
} from "../chunks";
import { isNineBySixteen, describeAspectRatio } from "../aspect";

const MB = 1_000_000;

function expectContiguous(videoSize: number, ranges: ChunkRange[]) {
	expect(ranges[0].start).toBe(0);
	for (let i = 1; i < ranges.length; i++) {
		expect(ranges[i].start).toBe(ranges[i - 1].end + 1);
	}
	expect(ranges[ranges.length - 1].end).toBe(videoSize - 1);
	expect(ranges.reduce((sum, r) => sum + r.size, 0)).toBe(videoSize);
}

describe("planChunks", () => {
	test("videos under 5 MB go up whole", () => {
		const plan = planChunks({ videoSize: 4 * MB });
		expect(plan).toEqual({ videoSize: 4 * MB, chunkSize: 4 * MB, totalChunkCount: 1 });
		assertValidPlan(plan);
	});

	test("matches the media transfer guide example", () => {
		const plan = planChunks({ videoSize: 50_000_123, preferredChunkSize: 10 * MB });
		expect(plan.totalChunkCount).toBe(5);
		const ranges = getChunkRanges(plan);
		expect(ranges[4]).toEqual({ index: 4, start: 40_000_000, end: 50_000_122, size: 10_000_123 });
		expect(formatContentRange({ range: ranges[0], videoSize: plan.videoSize })).toBe(
			"bytes 0-9999999/50000123",
		);
	});

	test("a video that fits one chunk is sent whole, not with chunk_size < video_size", () => {
		const plan = planChunks({ videoSize: 15 * MB });
		expect(plan.totalChunkCount).toBe(1);
		expect(plan.chunkSize).toBe(15 * MB);
		assertValidPlan(plan);
	});

	test("over 64 MB always uses at least two chunks", () => {
		const plan = planChunks({ videoSize: MAX_CHUNK_SIZE + 1, preferredChunkSize: MAX_CHUNK_SIZE });
		expect(plan.totalChunkCount).toBeGreaterThanOrEqual(2);
		assertValidPlan(plan);
	});

	test("chunk sizes stay within 5–64 MB and the last chunk under 128 MB", () => {
		const sizes = [5 * MB, MIN_CHUNK_SIZE, 64 * MB, 64 * MB + 1, 127 * MB, 333_333_333, 4_000_000_000];
		for (const preferred of [1, MIN_CHUNK_SIZE, 10 * MB, MAX_CHUNK_SIZE, 500 * MB]) {
			for (const videoSize of sizes) {
				const plan = planChunks({ videoSize, preferredChunkSize: preferred });
				assertValidPlan(plan);
				const ranges = getChunkRanges(plan);
				expectContiguous(videoSize, ranges);
				expect(plan.totalChunkCount).toBe(Math.floor(videoSize / plan.chunkSize));
				expect(ranges.length).toBeLessThanOrEqual(1000);
				if (ranges.length > 1) {
					for (const r of ranges.slice(0, -1)) {
						expect(r.size).toBeGreaterThanOrEqual(MIN_CHUNK_SIZE);
						expect(r.size).toBeLessThanOrEqual(MAX_CHUNK_SIZE);
					}
					expect(ranges[ranges.length - 1].size).toBeLessThanOrEqual(MAX_FINAL_CHUNK_SIZE);
				}
			}
		}
	});

	test("caps the count at 1000 chunks", () => {
		const plan = planChunks({ videoSize: 20_000 * MB, preferredChunkSize: MIN_CHUNK_SIZE });
		expect(plan.totalChunkCount).toBeLessThanOrEqual(1000);
		assertValidPlan(plan);
	});

	test("rejects empty or invalid sizes", () => {
		expect(() => planChunks({ videoSize: 0 })).toThrow();
		expect(() => planChunks({ videoSize: 1.5 })).toThrow();
	});
});

describe("uploadChunksSequentially", () => {
	const plan = planChunks({ videoSize: 50_000_123, preferredChunkSize: 10 * MB });

	test("sends chunks in order, one at a time", async () => {
		const seen: number[] = [];
		let inFlight = 0;
		await uploadChunksSequentially({
			plan,
			retryDelayMs: 0,
			sendChunk: async (range): Promise<ChunkSendResult> => {
				inFlight++;
				expect(inFlight).toBe(1);
				await Promise.resolve();
				seen.push(range.index);
				inFlight--;
				return { kind: range.index === 4 ? "complete" : "partial" };
			},
		});
		expect(seen).toEqual([0, 1, 2, 3, 4]);
	});

	test("retries the same chunk on server errors", async () => {
		const seen: number[] = [];
		let failures = 2;
		await uploadChunksSequentially({
			plan,
			retryDelayMs: 0,
			sendChunk: async (range) => {
				seen.push(range.index);
				if (range.index === 1 && failures-- > 0) return { kind: "retry", message: "5xx" };
				return { kind: range.index === 4 ? "complete" : "partial" };
			},
		});
		expect(seen).toEqual([0, 1, 1, 1, 2, 3, 4]);
	});

	test("stops on a non-retryable error", async () => {
		await expect(
			uploadChunksSequentially({
				plan,
				retryDelayMs: 0,
				sendChunk: async () => ({ kind: "error", message: "boom" }),
			}),
		).rejects.toThrow("boom");
	});

	test("fails if TikTok finishes early or wants more after the last chunk", async () => {
		await expect(
			uploadChunksSequentially({ plan, retryDelayMs: 0, sendChunk: async () => ({ kind: "complete" }) }),
		).rejects.toThrow();
		await expect(
			uploadChunksSequentially({ plan, retryDelayMs: 0, sendChunk: async () => ({ kind: "partial" }) }),
		).rejects.toThrow();
	});
});

describe("aspect", () => {
	test("detects 9:16", () => {
		expect(isNineBySixteen({ width: 1080, height: 1920 })).toBe(true);
		expect(isNineBySixteen({ width: 1080, height: 1921 })).toBe(true);
		expect(isNineBySixteen({ width: 1920, height: 1080 })).toBe(false);
		expect(isNineBySixteen({ width: 1080, height: 1080 })).toBe(false);
		expect(describeAspectRatio({ width: 1920, height: 1080 })).toBe("16:9");
	});
});
