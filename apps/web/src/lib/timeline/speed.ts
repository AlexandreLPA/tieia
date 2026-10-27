import { TIME_EPSILON_SECONDS } from "@/constants/animation-constants";
import { resolvePlaybackRateAtTime } from "@/lib/animation";
import { getNumberChannelForPath } from "@/lib/animation/number-channel";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";

/** Speed only exists on video and audio clips; everything else plays at 1x. */
export function getElementPlaybackRate(element: TimelineElement): number {
	return "playbackRate" in element &&
		element.playbackRate &&
		element.playbackRate > 0
		? element.playbackRate
		: 1;
}

export function hasSpeedCurve(element: TimelineElement): boolean {
	const channel = element.animations
		? getNumberChannelForPath({
				animations: element.animations,
				propertyPath: "playbackRate",
			})
		: null;
	return Boolean(channel && channel.keyframes.length > 0);
}

/**
 * Seconds of footage a stretch of the clip shows. Trims are measured in
 * footage and durations on the timeline; the speed converts between them.
 */
export function getFootageSeconds({
	element,
	from,
	to,
}: {
	element: TimelineElement;
	from: number;
	to: number;
}): number {
	const rate = getElementPlaybackRate(element);
	if (!hasSpeedCurve(element)) return (to - from) * rate;

	// Same sampling as the renderer's speed curve
	const span = to - from;
	const steps = Math.max(10, Math.ceil(span * 30));
	const dt = span / steps;
	let footage = 0;
	for (let i = 0; i < steps; i++) {
		footage +=
			resolvePlaybackRateAtTime({
				basePlaybackRate: rate,
				animations: element.animations,
				localTime: from + i * dt,
			}) * dt;
	}
	return footage;
}

/**
 * A new speed that keeps the same footage, like CapCut: the clip gets shorter
 * when sped up and longer when slowed down. Clips after it on the track move
 * along, so a longer clip doesn't run over them and the main track keeps no
 * gap.
 */
export function buildSpeedChangeUpdates({
	tracks,
	trackId,
	elementId,
	rate,
}: {
	tracks: TimelineTrack[];
	trackId: string;
	elementId: string;
	rate: number;
}): Array<{
	trackId: string;
	elementId: string;
	updates: Partial<TimelineElement>;
}> {
	const track = tracks.find((candidate) => candidate.id === trackId);
	const element = track?.elements.find(
		(candidate) => candidate.id === elementId,
	);
	if (!track || !element) return [];

	// A speed curve already decides how the footage maps; its length stays
	if (hasSpeedCurve(element) || rate <= 0) {
		return [{ trackId, elementId, updates: { playbackRate: rate } }];
	}

	const footage =
		element.sourceDuration != null
			? Math.max(0, element.sourceDuration - element.trimStart - element.trimEnd)
			: element.duration * getElementPlaybackRate(element);
	const duration = footage / rate;
	const delta = duration - element.duration;
	const updates: Array<{
		trackId: string;
		elementId: string;
		updates: Partial<TimelineElement>;
	}> = [{ trackId, elementId, updates: { playbackRate: rate, duration } }];

	const isMainTrack = track.type === "video" && track.isMain;
	const shouldShiftFollowing =
		delta > TIME_EPSILON_SECONDS ||
		(delta < -TIME_EPSILON_SECONDS && isMainTrack);
	if (!shouldShiftFollowing) return updates;

	const oldEnd = element.startTime + element.duration;
	for (const other of track.elements) {
		if (other.id === element.id) continue;
		if (other.startTime < oldEnd - TIME_EPSILON_SECONDS) continue;
		updates.push({
			trackId,
			elementId: other.id,
			updates: { startTime: other.startTime + delta },
		});
	}
	return updates;
}
