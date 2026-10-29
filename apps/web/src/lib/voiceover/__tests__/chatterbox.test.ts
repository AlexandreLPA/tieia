import { describe, expect, test } from "bun:test";
import {
	bestVariation,
	CHATTERBOX_LANGUAGES,
	describePace,
	describeSimilarity,
} from "../chatterbox";

describe("describeSimilarity", () => {
	test("reads 0.85 and above as the same voice", () => {
		expect(describeSimilarity(0.85)).toEqual({
			ok: true,
			text: "85/100, parecida com a referência",
		});
		expect(describeSimilarity(0.912).text).toStartWith("91/100");
	});

	test("points at the reference or the exaggeration below it", () => {
		const verdict = describeSimilarity(0.7);
		expect(verdict.ok).toBe(false);
		expect(verdict.text).toContain("troque a referência");
	});
});

describe("describePace", () => {
	test("calls 120 to 190 words per minute natural", () => {
		expect(describePace(120).ok).toBe(true);
		expect(describePace(190)).toEqual({
			ok: true,
			text: "190 palavras por minuto, ritmo natural",
		});
	});

	test("says which control to move when too fast or too slow", () => {
		expect(describePace(210.4)).toEqual({
			ok: false,
			text: "210 palavras por minuto, rápida demais: baixe o cfg",
		});
		expect(describePace(100).text).toContain("suba o cfg");
	});
});

describe("bestVariation", () => {
	test("picks the closest voice among takes at a natural pace", () => {
		expect(
			bestVariation([
				{ similarity: 0.97, wordsPerMinute: 230 },
				{ similarity: 0.91, wordsPerMinute: 160 },
				{ similarity: 0.93, wordsPerMinute: 150 },
			]),
		).toBe(2);
	});

	test("falls back to the closest voice when no pace is natural", () => {
		expect(
			bestVariation([
				{ similarity: 0.9, wordsPerMinute: 220 },
				{ similarity: 0.95, wordsPerMinute: 100 },
			]),
		).toBe(1);
	});

	test("suggests nothing without a reference to compare to", () => {
		expect(
			bestVariation([
				{ similarity: null, wordsPerMinute: 150 },
				{ similarity: null, wordsPerMinute: 160 },
			]),
		).toBeNull();
		expect(bestVariation([])).toBeNull();
	});
});

test("Portuguese comes first and every language is the model's", () => {
	expect(CHATTERBOX_LANGUAGES[0].code).toBe("pt");
	expect(CHATTERBOX_LANGUAGES).toHaveLength(23);
	expect(new Set(CHATTERBOX_LANGUAGES.map((l) => l.code)).size).toBe(23);
});
