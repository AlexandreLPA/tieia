import { Command } from "@/lib/commands/base-command";
import type { TimelineTrack } from "@/types/timeline";
import { generateUUID } from "@/utils/id";
import { createGroupIdRemapper } from "@/lib/timeline/group-utils";
import { EditorCore } from "@/core";
import {
	getFootageSeconds,
	isMainTrack,
	rippleShiftElements,
} from "@/lib/timeline";
import { splitAnimationsAtTime } from "@/lib/animation";

export class SplitElementsCommand extends Command {
	private savedState: TimelineTrack[] | null = null;
	private rightSideElements: { trackId: string; elementId: string }[] = [];
	private previousSelection: { trackId: string; elementId: string }[] = [];
	private readonly elements: { trackId: string; elementId: string }[];
	private readonly splitTime: number;
	private readonly retainSide: "both" | "left" | "right";
	private readonly rippleEnabled: boolean;
	private readonly magneticMainTrack: boolean;

	constructor({
		elements,
		splitTime,
		retainSide = "both",
		rippleEnabled = false,
		magneticMainTrack = false,
	}: {
		elements: { trackId: string; elementId: string }[];
		splitTime: number;
		retainSide?: "both" | "left" | "right";
		rippleEnabled?: boolean;
	/** Like CapCut's magnetic main track: removing footage there closes the gap */
	magneticMainTrack?: boolean;
	}) {
		super();
		this.elements = elements;
		this.splitTime = splitTime;
		this.retainSide = retainSide;
		this.rippleEnabled = rippleEnabled;
		this.magneticMainTrack = magneticMainTrack;
	}

	getRightSideElements(): { trackId: string; elementId: string }[] {
		return this.rightSideElements;
	}

	execute(): void {
		const editor = EditorCore.getInstance();
		this.savedState = editor.timeline.getTracks();
		this.previousSelection = editor.selection.getSelectedElements();
		this.rightSideElements = [];
		// the right pieces of a split group form a group of their own
		const remapGroupId = createGroupIdRemapper();

		const updatedTracks = this.savedState.map((track) => {
			const elementsToSplit = this.elements.filter(
				(target) => target.trackId === track.id,
			);

			if (elementsToSplit.length === 0) {
				return track;
			}

			let leftVisibleDurationForRipple: number | null = null;
			// Assigned inside the callback below, so the type is spelled out
			let removedTailForRipple = null as {
				afterTime: number;
				amount: number;
			} | null;
			const shouldRipple =
				this.rippleEnabled || (this.magneticMainTrack && isMainTrack(track));

			let elements = track.elements.flatMap((element) => {
				const shouldSplit = elementsToSplit.some(
					(target) => target.elementId === element.id,
				);

				if (!shouldSplit) {
					return [element];
				}

				const effectiveStart = element.startTime;
				const effectiveEnd = element.startTime + element.duration;

				if (
					this.splitTime <= effectiveStart ||
					this.splitTime >= effectiveEnd
				) {
					return [element];
				}

				const relativeTime = this.splitTime - element.startTime;
				const leftVisibleDuration = relativeTime;
				const rightVisibleDuration = element.duration - relativeTime;
				// Trims count footage; on a sped-up clip each timeline second
				// covers more of it
				const leftFootage = getFootageSeconds({
					element,
					from: 0,
					to: relativeTime,
				});
				const rightFootage = getFootageSeconds({
					element,
					from: relativeTime,
					to: element.duration,
				});
				const { leftAnimations, rightAnimations } = splitAnimationsAtTime({
					animations: element.animations,
					splitTime: relativeTime,
					shouldIncludeSplitBoundary: true,
				});

				if (this.retainSide === "left") {
					if (shouldRipple && elementsToSplit.length === 1) {
						removedTailForRipple = {
							afterTime: element.startTime + element.duration,
							amount: rightVisibleDuration,
						};
					}
					return [
						{
							...element,
							duration: leftVisibleDuration,
							trimEnd: element.trimEnd + rightFootage,
							name: `${element.name} (left)`,
							animations: leftAnimations,
						},
					];
				}

				if (this.retainSide === "right") {
					if (shouldRipple && elementsToSplit.length === 1) {
						leftVisibleDurationForRipple = leftVisibleDuration;
					}
					const newId = generateUUID();
					this.rightSideElements.push({
						trackId: track.id,
						elementId: newId,
					});
					return [
						{
							...element,
							id: newId,
							startTime: this.splitTime,
							duration: rightVisibleDuration,
							trimStart: element.trimStart + leftFootage,
							name: `${element.name} (right)`,
							animations: rightAnimations,
						},
					];
				}

				// "both" - split into two pieces
				const secondElementId = generateUUID();
				this.rightSideElements.push({
					trackId: track.id,
					elementId: secondElementId,
				});

				return [
					{
						...element,
						duration: leftVisibleDuration,
						trimEnd: element.trimEnd + rightFootage,
						name: `${element.name} (left)`,
						animations: leftAnimations,
						// The new cut starts plain; the right piece keeps the old transition
						...("transitionOut" in element && { transitionOut: undefined }),
						// Same for fades: fade in stays on the left, fade out on the right
						fadeOut: undefined,
					},
					{
						...element,
						id: secondElementId,
						startTime: this.splitTime,
						duration: rightVisibleDuration,
						trimStart: element.trimStart + leftFootage,
						name: `${element.name} (right)`,
						animations: rightAnimations,
						groupId: remapGroupId(element.groupId),
						fadeIn: undefined,
					},
				];
			});

			if (removedTailForRipple) {
				elements = rippleShiftElements({
					elements,
					afterTime: removedTailForRipple.afterTime,
					shiftAmount: removedTailForRipple.amount,
				});
			}

			if (leftVisibleDurationForRipple !== null) {
				elements = rippleShiftElements({
					elements,
					afterTime: this.splitTime,
					shiftAmount: leftVisibleDurationForRipple,
				});
			}

			return { ...track, elements } as typeof track;
		});

		editor.timeline.updateTracks(updatedTracks);

		if (this.rightSideElements.length > 0) {
			editor.selection.setSelectedElements({
				elements: this.rightSideElements,
			});
		}
	}

	undo(): void {
		if (this.savedState) {
			const editor = EditorCore.getInstance();
			editor.timeline.updateTracks(this.savedState);
			editor.selection.setSelectedElements({
				elements: this.previousSelection,
			});
		}
	}
}
