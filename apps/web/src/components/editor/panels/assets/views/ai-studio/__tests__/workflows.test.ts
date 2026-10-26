import { describe, expect, test } from "bun:test";
import { STARTER_PROMPTS, THINKING_MESSAGES } from "../constants";
import { VIDEO_WORKFLOWS } from "../workflows";

describe("VIDEO_WORKFLOWS", () => {
	test("keeps the three workflows in order", () => {
		expect(VIDEO_WORKFLOWS.map((w) => w.id)).toEqual([
			"youtube",
			"short",
			"podcast",
		]);
	});

	test("every workflow has unique step ids, a label and an action", () => {
		for (const workflow of VIDEO_WORKFLOWS) {
			const ids = workflow.steps.map((s) => s.id);
			expect(new Set(ids).size).toBe(ids.length);
			for (const step of workflow.steps) {
				expect(step.label.length).toBeGreaterThan(0);
				expect(step.action.length).toBeGreaterThan(0);
			}
		}
	});
});

describe("ai-studio constants", () => {
	test("starter prompts end open so the user completes them", () => {
		for (const starter of STARTER_PROMPTS)
			expect(starter.prompt.endsWith(" ")).toBe(true);
	});

	test("thinking messages are unique", () => {
		expect(new Set(THINKING_MESSAGES).size).toBe(THINKING_MESSAGES.length);
	});
});
