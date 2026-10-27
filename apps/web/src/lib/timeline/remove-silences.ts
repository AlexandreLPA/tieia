import { TIME_EPSILON_SECONDS } from "@/constants/animation-constants";
import { getElementPlaybackRate, hasSpeedCurve } from "@/lib/timeline/speed";
import type { TimeRange } from "@/lib/text-timeline-sync";
import type { SilenceRegion } from "@/types/ai";
import type {
	TimelineElement,
	TimelineTrack,
	UploadAudioElement,
	VideoElement,
} from "@/types/timeline";

/** Below this level the sound counts as silence (ffmpeg silencedetect) */
export const SILENCE_THRESHOLD_DB = -35;
/** Pauses shorter than this stay: they are part of how people talk */
export const SILENCE_MIN_DURATION_S = 0.6;
/** Room kept on each side of a pause, so words don't get clipped */
const SPEECH_PADDING_S = 0.12;
/** What's left of a pause after the padding must be at least this long */
const MIN_CUT_S = 0.25;

type MediaElement = VideoElement | UploadAudioElement;

function isMediaElement(element: TimelineElement): element is MediaElement {
	return (
		element.type === "video" ||
		(element.type === "audio" && element.sourceType === "upload")
	);
}

/**
 * Timeline ranges to cut out of a clip, from silences measured in its source
 * file. Only the part of the footage the clip shows counts, and the speed
 * turns footage seconds into timeline seconds. Latest first, so cutting one
 * doesn't move the ones still to come.
 */
export function getSilenceCuts({
	element,
	silences,
}: {
	element: MediaElement;
	silences: SilenceRegion[];
}): TimeRange[] {
	const rate = getElementPlaybackRate(element);
	const visibleStart = element.trimStart;
	const visibleEnd = element.trimStart + element.duration * rate;

	const cuts: TimeRange[] = [];
	for (const silence of silences) {
		// Dead air at the very start or end of the clip goes entirely
		const from =
			silence.start <= visibleStart
				? visibleStart
				: silence.start + SPEECH_PADDING_S;
		const to =
			silence.end >= visibleEnd ? visibleEnd : silence.end - SPEECH_PADDING_S;
		if (to - from < MIN_CUT_S) continue;

		cuts.push({
			start: element.startTime + (from - visibleStart) / rate,
			end: element.startTime + (to - visibleStart) / rate,
		});
	}

	// Never cut the whole clip away
	const kept =
		element.duration - cuts.reduce((sum, cut) => sum + cut.end - cut.start, 0);
	if (kept < MIN_CUT_S) return [];

	return cuts.sort((a, b) => b.start - a.start);
}

export function canRemoveSilences(element: TimelineElement): element is MediaElement {
	return isMediaElement(element) && !hasSpeedCurve(element);
}

/**
 * The clip plus its separated audio (or the muted video the audio came
 * from): both get the same cuts, so picture and sound stay in sync.
 */
export function getLinkedMediaElements({
	tracks,
	trackId,
	element,
}: {
	tracks: TimelineTrack[];
	trackId: string;
	element: MediaElement;
}): Array<{ trackId: string; elementId: string }> {
	const linked = [{ trackId, elementId: element.id }];
	for (const track of tracks) {
		if (track.id === trackId) continue;
		for (const candidate of track.elements) {
			if (
				isMediaElement(candidate) &&
				candidate.type !== element.type &&
				candidate.mediaId === element.mediaId &&
				Math.abs(candidate.startTime - element.startTime) < TIME_EPSILON_SECONDS &&
				Math.abs(candidate.trimStart - element.trimStart) < TIME_EPSILON_SECONDS
			) {
				linked.push({ trackId: track.id, elementId: candidate.id });
			}
		}
	}
	return linked;
}
