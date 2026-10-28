import { describe, expect, test } from "bun:test";
import {
	CANVAS_SIZES,
	coverScale,
	loopLengths,
	pickStock,
	stockQueries,
} from "@/lib/autopilot/helpers";

describe("coverScale", () => {
	const hd = CANVAS_SIZES["16:9"];

	test("is 1 when the image already has the canvas aspect ratio", () => {
		expect(coverScale({ width: 3840, height: 2160 }, hd)).toBeCloseTo(1);
	});

	test("scales a square image up to fill a landscape canvas", () => {
		// Fits at 1080 tall (scale 1), needs 1920 wide: 1920 / 1080
		expect(coverScale({ width: 1000, height: 1000 }, hd)).toBeCloseTo(1920 / 1080);
	});

	test("scales a portrait photo on a landscape canvas", () => {
		// 1000x2000 fits at 0.54 tall; covering the 1920 width needs 1.92 -> 1.92 / 0.54
		expect(coverScale({ width: 1000, height: 2000 }, hd)).toBeCloseTo(1.92 / 0.54);
	});

	test("never shrinks", () => {
		for (const size of Object.values(CANVAS_SIZES)) {
			expect(coverScale({ width: 1920, height: 1272 }, size)).toBeGreaterThanOrEqual(1);
		}
	});

	test("falls back to 1 without dimensions", () => {
		expect(coverScale({}, hd)).toBe(1);
		expect(coverScale({ width: 0, height: 100 }, hd)).toBe(1);
	});
});

describe("stockQueries", () => {
	test("tries the full phrase, then two words, then one", () => {
		expect(stockQueries("bioluminescent deep sea jellyfish")).toEqual([
			"bioluminescent deep sea jellyfish",
			"bioluminescent deep",
			"bioluminescent",
		]);
	});

	test("does not repeat queries for short phrases", () => {
		expect(stockQueries("jellyfish")).toEqual(["jellyfish"]);
		expect(stockQueries("deep sea")).toEqual(["deep sea", "deep"]);
	});

	test("ignores extra whitespace and empty input", () => {
		expect(stockQueries("  deep   sea  ")).toEqual(["  deep   sea  ", "deep sea", "deep"]);
		expect(stockQueries("")).toEqual([]);
	});
});

describe("pickStock", () => {
	test("prefers a clip that is long enough", () => {
		const results = [{ duration: 5 }, { duration: 20 }, { duration: 12 }];
		expect(pickStock(results, 10)).toEqual({ duration: 20 });
	});

	test("takes the longest clip when none is long enough", () => {
		const results = [{ duration: 5 }, { duration: 8 }];
		expect(pickStock(results, 30)).toEqual({ duration: 8 });
	});

	test("takes the first image (duration 0)", () => {
		const results = [{ duration: 0, id: 1 }, { duration: 0, id: 2 }];
		expect(pickStock(results, 6)?.id).toBe(1);
	});

	test("is undefined for an empty list", () => {
		expect(pickStock([], 6)).toBeUndefined();
	});
});

describe("loopLengths", () => {
	test("loops a short clip until the scene is full", () => {
		expect(loopLengths(4, 10)).toEqual([4, 4, 2]);
	});

	test("uses one copy when the clip is long enough", () => {
		expect(loopLengths(30, 8)).toEqual([8]);
	});

	test("fills the scene once when the clip length is unknown, instead of looping forever", () => {
		expect(loopLengths(0, 8)).toEqual([8]);
		expect(loopLengths(Number.NaN, 8)).toEqual([8]);
	});
});
