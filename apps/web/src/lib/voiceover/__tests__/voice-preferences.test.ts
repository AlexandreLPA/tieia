import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	DEFAULT_VOICE_TUNING,
	forgetVoice,
	getLastVoice,
	getVoiceTuning,
	isDefaultTuning,
	setLastVoice,
	setVoiceTuning,
	voiceLabel,
} from "../voice-preferences";

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

describe("voice preferences", () => {
	test("a voice never tuned uses the defaults", () => {
		expect(getVoiceTuning("Minha_voz")).toEqual(DEFAULT_VOICE_TUNING);
		expect(isDefaultTuning(getVoiceTuning("Minha_voz"))).toBe(true);
	});

	test("the tuning settled on comes back for the same voice only", () => {
		const tuned = { ...DEFAULT_VOICE_TUNING, exaggeration: 0.8, cfgWeight: 0.3, seed: 42 };
		setVoiceTuning("Minha_voz", tuned);
		expect(getVoiceTuning("Minha_voz")).toEqual(tuned);
		expect(getVoiceTuning("Outra")).toEqual(DEFAULT_VOICE_TUNING);
		expect(isDefaultTuning(tuned)).toBe(false);
	});

	test("remembers the last voice, and forgets a deleted one", () => {
		setLastVoice("Minha_voz");
		setVoiceTuning("Minha_voz", { ...DEFAULT_VOICE_TUNING, seed: 7 });
		expect(getLastVoice()).toBe("Minha_voz");

		forgetVoice("Minha_voz");
		expect(getLastVoice()).toBeNull();
		expect(getVoiceTuning("Minha_voz")).toEqual(DEFAULT_VOICE_TUNING);
	});

	test("works without storage (private window): nothing is remembered, nothing breaks", () => {
		Reflect.deleteProperty(globalThis, "localStorage");
		expect(() => setLastVoice("x")).not.toThrow();
		expect(getLastVoice()).toBeNull();
	});

	test("shows saved names with spaces", () => {
		expect(voiceLabel("Minha_voz_2")).toBe("Minha voz 2");
	});
});
