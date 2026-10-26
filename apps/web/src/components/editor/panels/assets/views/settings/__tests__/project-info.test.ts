import { describe, expect, test } from "bun:test";
import { findPresetIndexByAspectRatio } from "../project-info";

const presets = [
	{ width: 1920, height: 1080 },
	{ width: 1080, height: 1920 },
	{ width: 1080, height: 1080 },
];

describe("findPresetIndexByAspectRatio", () => {
	test("matches by reduced ratio, not by exact size", () => {
		expect(
			findPresetIndexByAspectRatio({ presets, targetAspectRatio: "9:16" }),
		).toBe(1);
		expect(
			findPresetIndexByAspectRatio({ presets, targetAspectRatio: "1:1" }),
		).toBe(2);
	});

	test("returns -1 when no preset has the ratio", () => {
		expect(
			findPresetIndexByAspectRatio({ presets, targetAspectRatio: "4:3" }),
		).toBe(-1);
	});
});
