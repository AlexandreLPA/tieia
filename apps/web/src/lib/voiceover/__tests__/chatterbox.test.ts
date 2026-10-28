import { describe, expect, test } from "bun:test";
import {
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

test("Portuguese comes first and every language is the model's", () => {
	expect(CHATTERBOX_LANGUAGES[0].code).toBe("pt");
	expect(CHATTERBOX_LANGUAGES).toHaveLength(23);
	expect(new Set(CHATTERBOX_LANGUAGES.map((l) => l.code)).size).toBe(23);
});
