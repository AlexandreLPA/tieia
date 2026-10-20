import { describe, expect, test } from "bun:test";
import type { ExportResult } from "@/types/export";
import {
	PLATFORM_PRESETS,
	createQueueItem,
	getPresetExportFilename,
	getPresetExportOptions,
	runExportQueue,
	type ExportPreset,
	type ExportQueueItem,
} from "../export-presets";

function getPreset(id: string): ExportPreset {
	const preset = PLATFORM_PRESETS.find((p) => p.id === id);
	if (!preset) throw new Error(`missing preset ${id}`);
	return preset;
}

describe("PLATFORM_PRESETS", () => {
	test("video presets set a resolution", () => {
		for (const preset of PLATFORM_PRESETS) {
			if (preset.format === "m4a") continue;
			expect(preset.resolution).toBeDefined();
		}
	});

	test("the podcast preset exports audio only", () => {
		expect(getPreset("podcast-audio").format).toBe("m4a");
	});

	test("ids are unique", () => {
		const ids = PLATFORM_PRESETS.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("getPresetExportOptions", () => {
	test("passes the resolution and keeps the audio", () => {
		expect(getPresetExportOptions({ preset: getPreset("twitter") })).toEqual({
			format: "mp4",
			quality: "medium",
			resolution: "720p",
			includeAudio: true,
		});
	});
});

describe("getPresetExportFilename", () => {
	test("names the file after the project and the preset", () => {
		expect(
			getPresetExportFilename({
				projectName: "Meu vídeo",
				preset: getPreset("youtube-4k"),
			}),
		).toBe("Meu vídeo - YouTube 4K.mp4");
		expect(
			getPresetExportFilename({
				projectName: "Meu vídeo",
				preset: getPreset("podcast-audio"),
			}),
		).toBe("Meu vídeo - Podcast (Somente Áudio).m4a");
	});

	test("replaces characters that file names can't hold", () => {
		expect(
			getPresetExportFilename({
				projectName: "Aula: parte 1",
				preset: getPreset("tiktok-reels"),
			}),
		).toBe("Aula - parte 1 - TikTok - Reels.mp4");
		expect(
			getPresetExportFilename({
				projectName: "Demo",
				preset: getPreset("web-email"),
			}),
		).toBe("Demo - Web - E-mail.webm");
	});
});

describe("runExportQueue", () => {
	async function run({
		presetIds,
		results,
	}: {
		presetIds: string[];
		results: (ExportResult | Error)[];
	}) {
		const items = presetIds.map((id) => createQueueItem(getPreset(id)));
		const saved: string[] = [];
		const finalState = new Map<string, Partial<ExportQueueItem>>();
		let call = 0;

		const summary = await runExportQueue({
			items,
			exportItem: async () => {
				const result = results[call++];
				if (result instanceof Error) throw result;
				return result;
			},
			saveResult: ({ item }) => saved.push(item.preset.id),
			onItemChange: ({ id, changes }) =>
				finalState.set(id, { ...finalState.get(id), ...changes }),
		});

		return {
			summary,
			saved,
			states: items.map((item) => finalState.get(item.id)),
		};
	}

	const ok: ExportResult = { success: true, buffer: new ArrayBuffer(8) };

	test("saves every successful export", async () => {
		const { summary, saved, states } = await run({
			presetIds: ["youtube-1080", "twitter"],
			results: [ok, ok],
		});
		expect(summary).toEqual({ completed: 2, failed: 0 });
		expect(saved).toEqual(["youtube-1080", "twitter"]);
		expect(states.map((s) => s?.status)).toEqual(["completed", "completed"]);
	});

	test("marks a failed result as an error and keeps going", async () => {
		const { summary, saved, states } = await run({
			presetIds: ["youtube-1080", "youtube-4k", "twitter"],
			results: [
				{ success: false, error: "Project is empty" },
				{ success: false, cancelled: true },
				ok,
			],
		});
		expect(summary).toEqual({ completed: 1, failed: 2 });
		expect(saved).toEqual(["twitter"]);
		expect(states.map((s) => [s?.status, s?.error])).toEqual([
			["error", "Project is empty"],
			["error", "Exportação cancelada"],
			["completed", undefined],
		]);
	});

	test("marks a thrown error and a missing buffer as errors", async () => {
		const { summary, saved, states } = await run({
			presetIds: ["youtube-1080", "twitter"],
			results: [new Error("encoder crashed"), { success: true }],
		});
		expect(summary).toEqual({ completed: 0, failed: 2 });
		expect(saved).toEqual([]);
		expect(states.map((s) => s?.error)).toEqual([
			"encoder crashed",
			"Falha na exportação",
		]);
	});
});
