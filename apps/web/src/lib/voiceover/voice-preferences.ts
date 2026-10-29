/**
 * What the Voiceover panel remembers between sessions, in this browser: the
 * voice used last and the tuning settled on for each cloned voice. Once a
 * voice is tuned, the next narration only needs the text.
 */

import { CHATTERBOX_CONTROLS } from "./chatterbox";

export interface VoiceTuning {
	exaggeration: number;
	cfgWeight: number;
	temperature: number;
	/** 0 picks a random seed for each take. */
	seed: number;
}

export const DEFAULT_VOICE_TUNING: VoiceTuning = {
	exaggeration: CHATTERBOX_CONTROLS.exaggeration.default,
	cfgWeight: CHATTERBOX_CONTROLS.cfgWeight.default,
	temperature: CHATTERBOX_CONTROLS.temperature.default,
	seed: 0,
};

const KEY = "opencut:voiceover";

interface StoredPreferences {
	lastVoice?: string;
	tunings?: Record<string, VoiceTuning>;
}

function read(): StoredPreferences {
	try {
		const raw = localStorage.getItem(KEY);
		return raw ? (JSON.parse(raw) as StoredPreferences) : {};
	} catch {
		return {};
	}
}

function write(preferences: StoredPreferences): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(preferences));
	} catch {
		// Private window or full storage: the panel still works, it just forgets
	}
}

export function getLastVoice(): string | null {
	return read().lastVoice ?? null;
}

export function setLastVoice(name: string | null): void {
	const preferences = read();
	write({ ...preferences, lastVoice: name ?? undefined });
}

export function getVoiceTuning(name: string): VoiceTuning {
	return { ...DEFAULT_VOICE_TUNING, ...read().tunings?.[name] };
}

export function setVoiceTuning(name: string, tuning: VoiceTuning): void {
	const preferences = read();
	write({ ...preferences, tunings: { ...preferences.tunings, [name]: tuning } });
}

export function isDefaultTuning(tuning: VoiceTuning): boolean {
	return (Object.keys(DEFAULT_VOICE_TUNING) as (keyof VoiceTuning)[]).every(
		(key) => tuning[key] === DEFAULT_VOICE_TUNING[key],
	);
}

export function forgetVoice(name: string): void {
	const preferences = read();
	const tunings = { ...preferences.tunings };
	delete tunings[name];
	write({
		lastVoice: preferences.lastVoice === name ? undefined : preferences.lastVoice,
		tunings,
	});
}

/** Display name of a saved voice: the service keeps "_" where spaces were. */
export function voiceLabel(name: string): string {
	return name.replaceAll("_", " ");
}
