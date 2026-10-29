/**
 * Chatterbox voice cloning: its languages, the ranges of its controls, and how
 * a take's metrics read for the person tuning the voice.
 */

export const CHATTERBOX_LANGUAGES = [
	{ code: "pt", name: "Português" },
	{ code: "en", name: "Inglês" },
	{ code: "es", name: "Espanhol" },
	{ code: "fr", name: "Francês" },
	{ code: "de", name: "Alemão" },
	{ code: "it", name: "Italiano" },
	{ code: "nl", name: "Holandês" },
	{ code: "pl", name: "Polonês" },
	{ code: "ru", name: "Russo" },
	{ code: "tr", name: "Turco" },
	{ code: "ar", name: "Árabe" },
	{ code: "he", name: "Hebraico" },
	{ code: "hi", name: "Hindi" },
	{ code: "ja", name: "Japonês" },
	{ code: "ko", name: "Coreano" },
	{ code: "zh", name: "Chinês" },
	{ code: "da", name: "Dinamarquês" },
	{ code: "fi", name: "Finlandês" },
	{ code: "no", name: "Norueguês" },
	{ code: "sv", name: "Sueco" },
	{ code: "el", name: "Grego" },
	{ code: "ms", name: "Malaio" },
	{ code: "sw", name: "Suaíli" },
] as const;

export const CHATTERBOX_CONTROLS = {
	exaggeration: { min: 0.25, max: 2, step: 0.05, default: 0.5 },
	cfgWeight: { min: 0, max: 1, step: 0.05, default: 0.5 },
	temperature: { min: 0.05, max: 2, step: 0.05, default: 0.8 },
} as const;

/** A similarity at or above this sounds like the same person. */
export const SIMILAR_VOICE = 0.85;
/** Natural narration pace, in words per minute. */
export const NATURAL_PACE = { min: 120, max: 190 } as const;

export interface TakeVerdict {
	ok: boolean;
	text: string;
}

export function describeSimilarity(similarity: number): TakeVerdict {
	const score = Math.round(similarity * 100);
	return similarity >= SIMILAR_VOICE
		? { ok: true, text: `${score}/100, parecida com a referência` }
		: {
				ok: false,
				text: `${score}/100, distante: troque a gravação ou baixe a Emoção`,
			};
}

export function describePace(wordsPerMinute: number): TakeVerdict {
	const pace = `${Math.round(wordsPerMinute)} palavras por minuto`;
	if (wordsPerMinute > NATURAL_PACE.max) {
		return { ok: false, text: `${pace}, rápida demais: baixe o Ritmo` };
	}
	if (wordsPerMinute < NATURAL_PACE.min) {
		return { ok: false, text: `${pace}, lenta: suba o Ritmo ou baixe a Emoção` };
	}
	return { ok: true, text: `${pace}, ritmo natural` };
}

/** Takes generated side by side from the same text, so the best one can be kept. */
export const VARIATION_COUNT = 3;

/**
 * The take to suggest among variations: the closest to the reference among
 * those at a natural pace, or among all of them when none is. Null without a
 * reference, since there is no similarity to compare.
 */
export function bestVariation(
	takes: { similarity: number | null; wordsPerMinute: number | null }[],
): number | null {
	const scored = takes
		.map((take, index) => ({ ...take, index }))
		.filter(
			(take): take is typeof take & { similarity: number } =>
				take.similarity !== null,
		);
	if (scored.length === 0) return null;
	const natural = scored.filter(
		(take) =>
			take.wordsPerMinute !== null &&
			take.wordsPerMinute >= NATURAL_PACE.min &&
			take.wordsPerMinute <= NATURAL_PACE.max,
	);
	const pool = natural.length > 0 ? natural : scored;
	return pool.reduce((best, take) =>
		take.similarity > best.similarity ? take : best,
	).index;
}
