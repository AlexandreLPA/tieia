import { describe, expect, test } from "bun:test";
import { cloudModelSummary, shortModelName } from "../ai-model-name";

describe("shortModelName", () => {
	test("drops the vendor and marks free models", () => {
		expect(shortModelName("nvidia/nemotron-3.5-super-vl:free")).toBe(
			"nemotron-3.5-super-vl (grátis)",
		);
		expect(shortModelName("minimax/minimax-m3.1-flash")).toBe(
			"minimax-m3.1-flash",
		);
	});
});

describe("cloudModelSummary", () => {
	test("says what a model with vision takes and how much context it has", () => {
		expect(
			cloudModelSummary({
				id: "nvidia/nemotron-3.5-super-vl:free",
				name: "Nemotron 3.5 Super VL",
				context: 1_000_000,
				inputs: ["image", "text", "video"],
				vision: true,
			}),
		).toBe("nvidia, grátis, 1M de contexto, aceita texto/imagem/vídeo");
	});

	test("warns that a text-only model cannot read video frames", () => {
		expect(
			cloudModelSummary({
				id: "google/gemma-4-31b-it:free",
				name: "Gemma 4 31B",
				context: 262_144,
				inputs: ["text"],
				vision: false,
			}),
		).toBe(
			"google, grátis, 262K de contexto, aceita texto (não analisa quadros do vídeo)",
		);
	});
});
