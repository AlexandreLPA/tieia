export type AutopilotAspect = "16:9" | "9:16" | "1:1";

export interface CanvasSize {
	width: number;
	height: number;
}

export const CANVAS_SIZES: Record<AutopilotAspect, CanvasSize> = {
	"16:9": { width: 1920, height: 1080 },
	"9:16": { width: 1080, height: 1920 },
	"1:1": { width: 1080, height: 1080 },
};

export const ORIENTATIONS = {
	"16:9": "landscape",
	"9:16": "portrait",
	"1:1": "square",
} as const;

/**
 * Extra scale so an image, already fitted inside the canvas, covers it instead
 * (the overflow is cropped). 1 when the size of the image is unknown.
 */
export function coverScale(
	asset: { width?: number; height?: number },
	canvas: CanvasSize,
): number {
	if (!asset.width || !asset.height) return 1;
	const fitX = canvas.width / asset.width;
	const fitY = canvas.height / asset.height;
	return Math.max(fitX, fitY) / Math.min(fitX, fitY);
}

/**
 * Stock searches to try in order for one scene: the full query, then its first
 * two words, then its first word. Stock sites match few results for long phrases.
 */
export function stockQueries(searchQuery: string): string[] {
	const words = searchQuery.split(/\s+/).filter(Boolean);
	return [...new Set([searchQuery, words.slice(0, 2).join(" "), words[0]])].filter(
		(query): query is string => Boolean(query),
	);
}

/**
 * Looks for a stock result that is at least `sceneDuration` long, else the longest
 * one. Images have no duration, so the first image wins.
 */
export function pickStock<T extends { duration: number }>(
	results: readonly T[],
	sceneDuration: number,
): T | undefined {
	return (
		results.find((video) => video.duration >= sceneDuration) ??
		[...results].sort((a, b) => b.duration - a.duration)[0]
	);
}

/**
 * Lengths of the copies of a clip that fill `sceneDuration`, looping a short clip.
 * A clip of unknown length (0, NaN) fills the scene with one copy instead of looping forever.
 */
export function loopLengths(clipDuration: number, sceneDuration: number): number[] {
	if (!(clipDuration > 0)) return [sceneDuration];
	const lengths: number[] = [];
	let placed = 0;
	while (placed < sceneDuration - 0.05) {
		const length = Math.min(clipDuration, sceneDuration - placed);
		lengths.push(length);
		placed += length;
	}
	return lengths;
}
