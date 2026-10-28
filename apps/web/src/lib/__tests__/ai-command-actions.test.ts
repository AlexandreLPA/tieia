import { describe, expect, test } from "bun:test";
import {
	describeCommandAction,
	toStudioAction,
} from "@/lib/ai-command-actions";

describe("toStudioAction", () => {
	test("maps cut and split to a cut at the given time", () => {
		for (const type of ["cut", "split", "split_clip", "CUT"]) {
			expect(toStudioAction({ type, params: { time: 12.5 } })).toEqual({
				type: "cortar",
				time: 12.5,
			});
		}
	});

	test("accepts numbers sent as strings", () => {
		expect(toStudioAction({ type: "cut", params: { time: "7" } })).toEqual({
			type: "cortar",
			time: 7,
		});
	});

	test("rejects a cut without a valid time", () => {
		expect(toStudioAction({ type: "cut", params: {} })).toBeNull();
		expect(toStudioAction({ type: "cut", params: { time: -1 } })).toBeNull();
		expect(toStudioAction({ type: "cut", params: { time: "abc" } })).toBeNull();
		expect(toStudioAction({ type: "cut" })).toBeNull();
	});

	test("maps add_text with its position, defaulting to the bottom", () => {
		expect(
			toStudioAction({
				type: "add_text",
				params: { text: "Obrigado", start: 25, duration: 4, position: "top" },
			}),
		).toEqual({
			type: "adicionar_texto",
			text: "Obrigado",
			start: 25,
			duration: 4,
			position: "topo",
		});
		expect(
			toStudioAction({ type: "add_text", params: { text: "Oi" } }),
		).toEqual({
			type: "adicionar_texto",
			text: "Oi",
			start: 0,
			duration: 3,
			position: "base",
		});
	});

	test("rejects add_text without text or with an impossible time range", () => {
		expect(toStudioAction({ type: "add_text", params: { text: "  " } })).toBeNull();
		expect(
			toStudioAction({ type: "add_text", params: { text: "x", start: -2 } }),
		).toBeNull();
		expect(
			toStudioAction({ type: "add_text", params: { text: "x", duration: 0 } }),
		).toBeNull();
	});

	test("maps remove_segments, mute and canvas size", () => {
		expect(
			toStudioAction({ type: "remove_segments", params: { start: 2, end: 5 } }),
		).toEqual({ type: "remover_trecho", start: 2, end: 5 });
		expect(
			toStudioAction({ type: "remove_segments", params: { start: 5, end: 2 } }),
		).toBeNull();
		expect(toStudioAction({ type: "mute" })).toEqual({ type: "silenciar" });
		expect(
			toStudioAction({ type: "set_canvas_size", params: { ratio: "9:16" } }),
		).toEqual({ type: "formato", ratio: "9:16" });
		expect(
			toStudioAction({ type: "set_canvas_size", params: { ratio: "2:1" } }),
		).toBeNull();
	});

	test("returns null for commands the editor cannot run yet", () => {
		for (const type of ["add_filter", "color_correct", "adjust_speed", "unknown"]) {
			expect(toStudioAction({ type, params: {} })).toBeNull();
		}
	});
});

describe("describeCommandAction", () => {
	test("describes supported actions in Portuguese", () => {
		expect(
			describeCommandAction({
				type: "add_text",
				params: { text: "Fim", start: 25, duration: 4 },
			}),
		).toBe('Texto "Fim" aos 25s, por 4s');
		expect(describeCommandAction({ type: "cut", params: { time: 1.25 } })).toBe(
			"Cortar os clipes em 1.3s",
		);
		expect(describeCommandAction({ type: "mute" })).toBe("Tirar o som dos clipes");
	});

	test("falls back to the model's description, then to a generic message", () => {
		expect(
			describeCommandAction({ type: "add_filter", description: "Filtro vintage" }),
		).toBe("Filtro vintage");
		expect(describeCommandAction({ type: "add_filter" })).toContain("ainda não");
	});
});
