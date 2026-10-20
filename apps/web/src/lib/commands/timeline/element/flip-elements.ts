import { Command } from "@/lib/commands/base-command";
import type { TimelineTrack } from "@/types/timeline";
import { isVisualElement } from "@/lib/timeline/element-utils";
import { EditorCore } from "@/core";

export type FlipAxis = "horizontal" | "vertical";

const FLIP_KEY = { horizontal: "flipX", vertical: "flipY" } as const;

/**
 * Flips the given elements along one axis. With a mixed selection every
 * element ends up flipped; once all are flipped, they all go back.
 */
export function flipElementsInTracks({
	tracks,
	elements,
	axis,
}: {
	tracks: TimelineTrack[];
	elements: { trackId: string; elementId: string }[];
	axis: FlipAxis;
}): TimelineTrack[] {
	const key = FLIP_KEY[axis];
	const isTarget = (trackId: string, elementId: string) =>
		elements.some(
			(target) => target.trackId === trackId && target.elementId === elementId,
		);

	const targets = tracks.flatMap((track) =>
		track.elements
			.filter((element) => isTarget(track.id, element.id))
			.filter(isVisualElement),
	);
	if (targets.length === 0) return tracks;

	const shouldFlip = targets.some((element) => !element.transform[key]);

	return tracks.map((track) => {
		if (!elements.some((target) => target.trackId === track.id)) return track;
		const newElements = track.elements.map((element) => {
			if (!isTarget(track.id, element.id) || !isVisualElement(element)) {
				return element;
			}
			if (!!element.transform[key] === shouldFlip) return element;
			const transform = { ...element.transform };
			if (shouldFlip) {
				transform[key] = true;
			} else {
				// Same shape as elements saved before flipping existed
				delete transform[key];
			}
			return { ...element, transform };
		});
		return { ...track, elements: newElements } as typeof track;
	});
}

export class FlipElementsCommand extends Command {
	private savedState: TimelineTrack[] | null = null;

	constructor(
		private elements: { trackId: string; elementId: string }[],
		private axis: FlipAxis,
	) {
		super();
	}

	execute(): void {
		const editor = EditorCore.getInstance();
		this.savedState = editor.timeline.getTracks();

		const updatedTracks = flipElementsInTracks({
			tracks: this.savedState,
			elements: this.elements,
			axis: this.axis,
		});
		if (updatedTracks === this.savedState) return;

		editor.timeline.updateTracks(updatedTracks);
	}

	undo(): void {
		if (this.savedState) {
			const editor = EditorCore.getInstance();
			editor.timeline.updateTracks(this.savedState);
		}
	}
}
