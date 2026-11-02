import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	DEFAULT_LANDING_LANGUAGE,
	LANDING_COPY,
	LANDING_LANGUAGES,
	htmlLangFor,
	readStoredLanguage,
	storeLanguage,
} from "../i18n";

let store: Map<string, string>;

beforeEach(() => {
	store = new Map();
	Object.assign(globalThis, {
		localStorage: {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => store.set(key, value),
		},
	});
});

afterEach(() => {
	Reflect.deleteProperty(globalThis, "localStorage");
});

describe("landing language", () => {
	test("Portuguese until the visitor picks another one", () => {
		expect(DEFAULT_LANDING_LANGUAGE).toBe("pt");
		expect(readStoredLanguage()).toBe("pt");
	});

	test("the picked language comes back", () => {
		storeLanguage("es");
		expect(readStoredLanguage()).toBe("es");
	});

	test("an unknown stored value falls back to Portuguese", () => {
		store.set("tieia-landing-language", "fr");
		expect(readStoredLanguage()).toBe("pt");
	});

	test("blocked storage neither throws nor changes the default", () => {
		Object.assign(globalThis, {
			localStorage: {
				getItem: () => {
					throw new Error("SecurityError");
				},
				setItem: () => {
					throw new Error("SecurityError");
				},
			},
		});
		expect(() => storeLanguage("en")).not.toThrow();
		expect(readStoredLanguage()).toBe("pt");
	});

	test("each language sets its own lang attribute", () => {
		expect(htmlLangFor("pt")).toBe("pt-BR");
		expect(htmlLangFor("en")).toBe("en");
		expect(htmlLangFor("es")).toBe("es");
	});
});

describe("landing copy", () => {
	const pt = LANDING_COPY.pt;

	test.each(LANDING_LANGUAGES.map((language) => language.code))(
		"%s has every list item the Portuguese text has",
		(code) => {
			const copy = LANDING_COPY[code];
			expect(copy.features.items).toHaveLength(pt.features.items.length);
			expect(copy.whereItRuns.local).toHaveLength(pt.whereItRuns.local.length);
			expect(copy.whereItRuns.cloud).toHaveLength(pt.whereItRuns.cloud.length);
			expect(copy.cta.steps).toHaveLength(pt.cta.steps.length);
		},
	);

	test("no text is left empty", () => {
		const strings = (value: unknown): string[] =>
			typeof value === "string"
				? [value]
				: Object.values(value as object).flatMap(strings);
		for (const copy of Object.values(LANDING_COPY)) {
			for (const text of strings(copy)) expect(text.trim()).not.toBe("");
		}
	});
});
