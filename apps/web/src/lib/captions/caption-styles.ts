import type { TextElement } from "@/types/timeline";

export type CaptionStyleConfig = Pick<
	TextElement,
	| "fontWeight"
	| "color"
	| "highlightColor"
	| "highlightStyle"
	| "wordPopScale"
	| "stroke"
	| "shadow"
	| "background"
	| "opacity"
>;

export interface CaptionStyle {
	id: string;
	name: string;
	config: CaptionStyleConfig;
}

const NO_BACKGROUND: TextElement["background"] = {
	enabled: false,
	color: "#000000",
	cornerRadius: 0,
	paddingX: 12,
	paddingY: 6,
	offsetX: 0,
	offsetY: 0,
};

const BLACK_OUTLINE = { enabled: true, color: "#000000", width: 12 };
const NO_SHADOW = {
	enabled: false,
	color: "#000000",
	blur: 15,
	offsetX: 0,
	offsetY: 6,
};

/** Short-video caption looks, CapCut style. The first one is the default. */
export const CAPTION_STYLES: CaptionStyle[] = [
	{
		id: "highlight-yellow",
		name: "Destaque amarelo",
		config: {
			fontWeight: "bold",
			color: "#FFFFFF",
			highlightColor: "#FACC15",
			highlightStyle: "word",
			wordPopScale: 1.12,
			stroke: BLACK_OUTLINE,
			shadow: NO_SHADOW,
			background: NO_BACKGROUND,
			opacity: 1,
		},
	},
	{
		id: "box-red",
		name: "Caixa na palavra",
		config: {
			fontWeight: "bold",
			color: "#FFFFFF",
			highlightColor: "#FE2C55",
			highlightStyle: "box",
			wordPopScale: 1.08,
			stroke: { enabled: true, color: "#000000", width: 6 },
			shadow: NO_SHADOW,
			background: NO_BACKGROUND,
			opacity: 1,
		},
	},
	{
		id: "highlight-green",
		name: "Destaque verde",
		config: {
			fontWeight: "bold",
			color: "#FFFFFF",
			highlightColor: "#4ADE80",
			highlightStyle: "word",
			wordPopScale: 1.12,
			stroke: BLACK_OUTLINE,
			shadow: NO_SHADOW,
			background: NO_BACKGROUND,
			opacity: 1,
		},
	},
	{
		id: "outline",
		name: "Contorno (sem destaque)",
		config: {
			fontWeight: "bold",
			color: "#FFFFFF",
			highlightColor: "#FACC15",
			highlightStyle: "none",
			wordPopScale: 1,
			stroke: BLACK_OUTLINE,
			shadow: NO_SHADOW,
			background: NO_BACKGROUND,
			opacity: 1,
		},
	},
	{
		id: "soft-shadow",
		name: "Sombra suave",
		config: {
			fontWeight: "bold",
			color: "#FFFFFF",
			highlightColor: "#FDE68A",
			highlightStyle: "word",
			wordPopScale: 1,
			stroke: { ...BLACK_OUTLINE, enabled: false },
			shadow: { ...NO_SHADOW, enabled: true, color: "#000000CC" },
			background: NO_BACKGROUND,
			opacity: 1,
		},
	},
	{
		id: "black-box",
		name: "Fundo preto",
		config: {
			fontWeight: "bold",
			color: "#FFFFFF",
			highlightColor: "#FACC15",
			highlightStyle: "progressive",
			wordPopScale: 1,
			stroke: { ...BLACK_OUTLINE, enabled: false },
			shadow: NO_SHADOW,
			background: {
				enabled: true,
				color: "#000000",
				cornerRadius: 4,
				paddingX: 12,
				paddingY: 6,
				offsetX: 0,
				offsetY: 0,
			},
			opacity: 0.95,
		},
	},
];

export const DEFAULT_CAPTION_STYLE_ID = CAPTION_STYLES[0].id;

export function getCaptionStyle(id: string): CaptionStyle {
	return CAPTION_STYLES.find((style) => style.id === id) ?? CAPTION_STYLES[0];
}

export interface CaptionWord {
	word: string;
	start: number;
	end: number;
}

export interface CaptionSegment {
	text: string;
	start: number;
	end: number;
	words?: CaptionWord[];
}

// A pause this long starts a new caption even if it isn't full yet
const PAUSE_BREAK_S = 0.6;
// Keep the last caption on screen briefly after its last word
const TAIL_HOLD_S = 0.3;

/**
 * Splits transcript segments into short captions of up to `maxWords` words,
 * also breaking at sentence ends and pauses. `maxWords` 0 keeps whole
 * segments. Segments without word timings are kept as they are.
 */
export function chunkCaptionSegments({
	segments,
	maxWords,
	uppercase = false,
}: {
	segments: CaptionSegment[];
	maxWords: number;
	uppercase?: boolean;
}): CaptionSegment[] {
	const caseOf = (text: string) => (uppercase ? text.toUpperCase() : text);
	const chunks: CaptionSegment[] = [];

	for (const segment of segments) {
		const words = (segment.words ?? [])
			.map((word) => ({ ...word, word: caseOf(word.word.trim()) }))
			.filter((word) => word.word.length > 0);

		if (maxWords <= 0 || words.length === 0) {
			chunks.push({
				...segment,
				text: caseOf(segment.text.trim()),
				words: words.length > 0 ? words : undefined,
			});
			continue;
		}

		let current: CaptionWord[] = [];
		const flush = () => {
			if (current.length === 0) return;
			chunks.push({
				text: current.map((word) => word.word).join(" "),
				start: current[0].start,
				end: current[current.length - 1].end,
				words: current,
			});
			current = [];
		};

		for (const word of words) {
			const previous = current[current.length - 1];
			if (previous && word.start - previous.end >= PAUSE_BREAK_S) flush();
			current.push(word);
			if (current.length >= maxWords || /[.!?…]$/.test(word.word)) flush();
		}
		flush();
	}

	// Hold each caption until the next one starts (up to a short tail), so
	// the text doesn't blink off between words
	for (let i = 0; i < chunks.length; i++) {
		const next = chunks[i + 1];
		const hold = chunks[i].end + TAIL_HOLD_S;
		chunks[i].end = next ? Math.max(chunks[i].end, Math.min(next.start, hold)) : hold;
	}
	return chunks.filter((chunk) => chunk.end > chunk.start);
}
