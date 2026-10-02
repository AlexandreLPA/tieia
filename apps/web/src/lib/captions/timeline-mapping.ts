import type { CaptionSegment, CaptionWord } from "./caption-styles";

/** A timeline clip that plays part of the transcribed source file */
export interface SourceClip {
	startTime: number;
	duration: number;
	trimStart: number;
	playbackRate?: number;
}

/**
 * Where a source-file time lands on the timeline, or null when that moment
 * was cut out. With several clips (e.g. a video plus its separated audio)
 * the earliest placement wins.
 */
export function sourceTimeToTimeline({
	time,
	clips,
}: {
	time: number;
	clips: SourceClip[];
}): number | null {
	let best: number | null = null;
	for (const clip of clips) {
		const rate = clip.playbackRate && clip.playbackRate > 0 ? clip.playbackRate : 1;
		const sourceEnd = clip.trimStart + clip.duration * rate;
		if (time < clip.trimStart || time >= sourceEnd) continue;
		const timelineTime = clip.startTime + (time - clip.trimStart) / rate;
		if (best === null || timelineTime < best) best = timelineTime;
	}
	return best;
}

function mapWord(word: CaptionWord, clips: SourceClip[]): CaptionWord | null {
	const start = sourceTimeToTimeline({ time: word.start, clips });
	if (start === null) return null;
	// Use the word's midpoint to find its clip, so a word straddling a cut
	// keeps a sane length instead of jumping to another clip
	const middle = sourceTimeToTimeline({
		time: (word.start + word.end) / 2,
		clips,
	});
	const end =
		middle !== null && middle >= start
			? start + (middle - start) * 2
			: start + Math.max(0.05, word.end - word.start);
	return { ...word, start, end };
}

/**
 * Transcripts are timed against the source file; after cuts, silence
 * removal or speed changes those times no longer match the timeline.
 * Moves every word to where it actually plays and drops what was cut.
 */
export function mapSegmentsToTimeline({
	segments,
	clips,
}: {
	segments: CaptionSegment[];
	clips: SourceClip[];
}): CaptionSegment[] {
	if (clips.length === 0) return segments;

	const mapped: CaptionSegment[] = [];
	for (const segment of segments) {
		if (segment.words && segment.words.length > 0) {
			const words = segment.words
				.map((word) => mapWord(word, clips))
				.filter((word): word is CaptionWord => word !== null)
				.sort((a, b) => a.start - b.start);
			if (words.length === 0) continue;
			mapped.push({
				text: words.map((word) => word.word.trim()).join(" "),
				start: words[0].start,
				end: words[words.length - 1].end,
				words,
			});
			continue;
		}

		// No word timings (e.g. translations): place the whole phrase
		const start = sourceTimeToTimeline({ time: segment.start, clips });
		if (start === null) continue;
		const end = sourceTimeToTimeline({
			time: Math.max(segment.start, segment.end - 0.01),
			clips,
		});
		mapped.push({
			...segment,
			start,
			end: end !== null && end > start ? end : start + (segment.end - segment.start),
		});
	}
	return mapped.sort((a, b) => a.start - b.start);
}
