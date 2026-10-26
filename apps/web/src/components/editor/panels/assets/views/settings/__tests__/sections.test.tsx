import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AIOptimizationSection } from "../ai-optimization";
import { APIKeysSection } from "../api-keys";

describe("APIKeysSection", () => {
	const html = renderToStaticMarkup(<APIKeysSection />);

	test("lists every provider field", () => {
		for (const label of [
			"ID de cliente do Freesound",
			"Chave de API do Freesound",
			"Chave de API do Sarvam AI",
			"Chave de API do Pexels",
			"Token de API do Replicate",
		]) {
			expect(html).toContain(label);
		}
	});

	test("marks only the two Freesound fields as required", () => {
		expect(html.split("Obrigatório").length - 1).toBe(2);
	});
});

describe("AIOptimizationSection", () => {
	test("renders before the backend status arrives", () => {
		expect(renderToStaticMarkup(<AIOptimizationSection />)).toContain(
			"Carregando status da otimização",
		);
	});
});
