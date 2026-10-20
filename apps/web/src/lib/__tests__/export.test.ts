import { describe, expect, test } from "bun:test";
import {
	getExportDimensions,
	getExportFileExtension,
	getExportMimeType,
	isAudioOnlyExportFormat,
} from "../export";

const LANDSCAPE_1080 = { width: 1920, height: 1080 };
const PORTRAIT_1080 = { width: 1080, height: 1920 };

describe("getExportDimensions", () => {
	test("original keeps the canvas size", () => {
		expect(
			getExportDimensions({
				canvasSize: LANDSCAPE_1080,
				resolution: "original",
			}),
		).toEqual(LANDSCAPE_1080);
		expect(getExportDimensions({ canvasSize: LANDSCAPE_1080 })).toEqual(
			LANDSCAPE_1080,
		);
	});

	test("sets the shorter side of a landscape project", () => {
		const sizes = (["480p", "720p", "1080p", "4k"] as const).map((resolution) =>
			getExportDimensions({ canvasSize: LANDSCAPE_1080, resolution }),
		);
		expect(sizes).toEqual([
			{ width: 854, height: 480 },
			{ width: 1280, height: 720 },
			{ width: 1920, height: 1080 },
			{ width: 3840, height: 2160 },
		]);
	});

	test("keeps portrait and square projects in shape", () => {
		expect(
			getExportDimensions({ canvasSize: PORTRAIT_1080, resolution: "720p" }),
		).toEqual({ width: 720, height: 1280 });
		expect(
			getExportDimensions({ canvasSize: PORTRAIT_1080, resolution: "4k" }),
		).toEqual({ width: 2160, height: 3840 });
		expect(
			getExportDimensions({
				canvasSize: { width: 1080, height: 1080 },
				resolution: "480p",
			}),
		).toEqual({ width: 480, height: 480 });
	});

	test("always returns even sides for H.264", () => {
		const odd = getExportDimensions({
			canvasSize: { width: 1001, height: 777 },
			resolution: "original",
		});
		const scaled = getExportDimensions({
			canvasSize: { width: 1080, height: 1350 },
			resolution: "480p",
		});
		for (const { width, height } of [odd, scaled]) {
			expect(width % 2).toBe(0);
			expect(height % 2).toBe(0);
		}
		expect(scaled).toEqual({ width: 480, height: 600 });
	});
});

describe("audio-only export", () => {
	test("m4a is the audio-only format", () => {
		expect(isAudioOnlyExportFormat({ format: "m4a" })).toBe(true);
		expect(isAudioOnlyExportFormat({ format: "mp4" })).toBe(false);
		expect(isAudioOnlyExportFormat({ format: "webm" })).toBe(false);
	});

	test("m4a files are MPEG-4 audio", () => {
		expect(getExportFileExtension({ format: "m4a" })).toBe(".m4a");
		expect(getExportMimeType({ format: "m4a" })).toBe("audio/mp4");
	});
});
