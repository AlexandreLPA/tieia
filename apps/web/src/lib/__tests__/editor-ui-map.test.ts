import { describe, expect, test } from "bun:test";
import { describeAction, parseReply } from "@/lib/ai-editor-actions";
import {
	buildUiMapPrompt,
	openUiDestination,
	UI_DESTINATIONS,
} from "@/lib/editor-ui-map";
import { useAssetsPanelStore } from "@/stores/assets-panel-store";

describe("UI map", () => {
	test("every destination has a unique id and something to open or a path to follow", () => {
		const ids = UI_DESTINATIONS.map((d) => d.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const destination of UI_DESTINATIONS) {
			expect(destination.path.length).toBeGreaterThan(0);
		}
	});

	test("the prompt lists the voice cloning path for the chat", () => {
		const prompt = buildUiMapPrompt();
		expect(prompt).toContain("clonar-voz");
		expect(prompt).toContain("Áudio → Narração → Minhas vozes → Clonar voz");
	});

	test("opening voice cloning goes to Áudio, sub-tab Narração, and points at the button", () => {
		openUiDestination("clonar-voz");
		const state = useAssetsPanelStore.getState();
		expect(state.activeTab).toBe("audio");
		expect(state.subTabs.audio).toBe("voiceover");
		expect(state.uiTarget?.id).toBe("voice/clone");
	});

	test("an unknown place is refused with a readable reason", () => {
		expect(() => openUiDestination("nao-existe")).toThrow("Não conheço");
	});
});

describe("abrir action", () => {
	test("a reply can offer to show where a feature is", () => {
		const reply = parseReply(
			'Fica em Áudio → Narração.\n```acoes\n[{"tipo": "abrir", "destino": "clonar-voz"}]\n```',
		);
		expect(reply.actions).toEqual([{ type: "abrir", destination: "clonar-voz" }]);
		expect(describeAction(reply.actions[0])).toBe("Mostrar onde fica: Clonar voz");
	});

	test("places the chat made up, or that cannot be opened, are dropped", () => {
		const reply = parseReply(
			'```acoes\n[{"tipo": "abrir", "destino": "botao-magico"}, {"tipo": "abrir", "destino": "menu-do-clipe"}]\n```',
		);
		expect(reply.actions).toEqual([]);
	});
});
