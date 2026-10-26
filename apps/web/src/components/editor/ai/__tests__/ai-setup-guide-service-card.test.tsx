import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CommandBlock, ServiceCard } from "../ai-setup-guide/service-card";

describe("ServiceCard", () => {
	test("shows title, detail and the status badge with its dot color", () => {
		const html = renderToStaticMarkup(
			<ServiceCard title="Ollama" status="running" detail=":11434" />,
		);
		expect(html).toContain("Ollama");
		expect(html).toContain(":11434");
		expect(html).toContain("Em execução");
		expect(html).toContain("bg-green-500");
	});

	test("renders children below the header", () => {
		const html = renderToStaticMarkup(
			<ServiceCard title="Whisper" status="not_installed" detail="">
				<CommandBlock label="Instalar" command="docker compose up -d whisper" />
			</ServiceCard>,
		);
		expect(html).toContain("Não instalado");
		expect(html).toContain("Instalar:");
		expect(html).toContain("docker compose up -d whisper");
	});
});
