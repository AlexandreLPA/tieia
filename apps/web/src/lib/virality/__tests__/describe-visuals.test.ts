import { describe, expect, test } from "bun:test";
import { buildReadingPrompt, parseReading } from "../describe-visuals";

describe("parseReading", () => {
	test("splits the hook from the whole-video description", () => {
		const answer =
			"GANCHO: Uma mão abre um pote de creme.\nVÍDEO: A mesma mão espalha o creme no rosto. Aparece o texto 'antes e depois'.";
		expect(parseReading(answer)).toEqual({
			hook: "Uma mão abre um pote de creme.",
			description:
				"A mesma mão espalha o creme no rosto. Aparece o texto 'antes e depois'.",
		});
	});

	test("accepts the label without the accent and in any case", () => {
		const { hook, description } = parseReading("gancho: a\nvideo: b");
		expect(hook).toBe("a");
		expect(description).toBe("b");
	});

	test("keeps a description that runs over several lines", () => {
		const { description } = parseReading("GANCHO: x\nVÍDEO: linha um\nlinha dois");
		expect(description).toBe("linha um\nlinha dois");
	});

	test("a model that ignored the format still gives a description", () => {
		expect(parseReading("  Um homem mostra um tênis.  ")).toEqual({
			hook: "",
			description: "Um homem mostra um tênis.",
		});
	});

	test("an answer with only the hook line keeps it as the description too", () => {
		const { hook, description } = parseReading("GANCHO: só isso");
		expect(hook).toBe("só isso");
		expect(description).toBe("GANCHO: só isso");
	});

	test("an empty answer is empty", () => {
		expect(parseReading("   ")).toEqual({ hook: "", description: "" });
	});
});

describe("buildReadingPrompt", () => {
	test("says how many frames come and what the answer looks like", () => {
		const prompt = buildReadingPrompt([0.5, 2.5, 4.5]);
		expect(prompt).toContain("3 quadros");
		expect(prompt).toContain("GANCHO:");
		expect(prompt).toContain("VÍDEO:");
		expect(prompt).toContain("primeiros 3 segundos");
	});
});
