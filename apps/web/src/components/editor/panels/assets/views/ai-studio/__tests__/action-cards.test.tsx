import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { StudioActionState } from "@/stores/ai-store";
import { ActionCards } from "../action-cards";

const noop = () => {};

function render(states: StudioActionState[]) {
	return renderToStaticMarkup(
		<ActionCards states={states} onApply={noop} onApplyAll={noop} />,
	);
}

describe("ActionCards", () => {
	test("pending action shows its description and an Aplicar button", () => {
		const html = render([
			{ action: { type: "cortar", time: 5 }, status: "pendente" },
		]);
		expect(html).toContain("Mudanças sugeridas");
		expect(html).toContain("Cortar os clipes em");
		expect(html).toContain(">Aplicar</button>");
		expect(html).not.toContain("Aplicar todas");
	});

	test("applied and failed actions show their state instead of the button", () => {
		const html = render([
			{ action: { type: "silenciar" }, status: "aplicada" },
			{
				action: { type: "legendar" },
				status: "falhou",
				detail: "Sem transcrição",
			},
		]);
		expect(html).not.toContain(">Aplicar</button>");
		expect(html).toContain("✓ Aplicada");
		expect(html).toContain("Falhou");
		expect(html).toContain("Sem transcrição");
		expect(html).toContain("border-red-500/30");
	});

	test("Aplicar todas appears only with more than one pending action and counts them", () => {
		const html = render([
			{ action: { type: "cortar", time: 1 }, status: "pendente" },
			{ action: { type: "cortar", time: 2 }, status: "pendente" },
			{ action: { type: "silenciar" }, status: "aplicada" },
		]);
		expect(html).toContain("Aplicar todas (2)");
	});
});
