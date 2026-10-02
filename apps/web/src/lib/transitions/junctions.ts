import type {
	ImageElement,
	TimelineTrack,
	VideoElement,
} from "@/types/timeline";

type MediaElement = VideoElement | ImageElement;

export interface TransitionJunction {
	from: MediaElement;
	to: MediaElement;
	/** Timeline time where `from` ends and `to` begins */
	cutTime: number;
}

// Splits and snapping land on frame boundaries, so this covers 30 fps rounding
const ADJACENT_TOLERANCE_S = 0.04;

function isMediaElement(
	element: TimelineTrack["elements"][number],
): element is MediaElement {
	return element.type === "video" || element.type === "image";
}

/** Places on a track where two media clips touch and a transition fits. */
export function getTransitionJunctions({
	track,
}: {
	track: TimelineTrack;
}): TransitionJunction[] {
	if (track.type !== "video") return [];

	const elements = track.elements
		.filter((element) => !("hidden" in element && element.hidden))
		.slice()
		.sort((a, b) => a.startTime - b.startTime);

	const junctions: TransitionJunction[] = [];
	for (let i = 0; i < elements.length - 1; i++) {
		const from = elements[i];
		const to = elements[i + 1];
		if (!isMediaElement(from) || !isMediaElement(to)) continue;
		const cutTime = from.startTime + from.duration;
		if (Math.abs(to.startTime - cutTime) > ADJACENT_TOLERANCE_S) continue;
		junctions.push({ from, to, cutTime });
	}
	return junctions;
}

/** Longest transition that still fits inside both clips. */
export function getMaxTransitionDuration({
	junction,
}: {
	junction: TransitionJunction;
}): number {
	return Math.max(
		0.1,
		Math.min(3, junction.from.duration, junction.to.duration),
	);
}
