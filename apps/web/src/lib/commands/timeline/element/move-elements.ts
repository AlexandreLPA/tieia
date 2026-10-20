import { Command } from "@/lib/commands/base-command";
import { EditorCore } from "@/core";
import type {
	TimelineTrack,
	TimelineElement,
	TrackType,
} from "@/types/timeline";
import {
	buildEmptyTrack,
	isMainTrack,
	validateElementTrackCompatibility,
	enforceMainTrackStart,
} from "@/lib/timeline/track-utils";
import { rippleShiftElements } from "@/lib/timeline/ripple-utils";
import { getGroupMembers } from "@/lib/timeline/group-utils";

export class MoveElementCommand extends Command {
	private savedState: TimelineTrack[] | null = null;
	private readonly sourceTrackId: string;
	private readonly targetTrackId: string;
	private readonly elementId: string;
	private readonly newStartTime: number;
	private readonly createTrack: { type: TrackType; index: number } | undefined;
	private readonly rippleEnabled: boolean;

	constructor({
		sourceTrackId,
		targetTrackId,
		elementId,
		newStartTime,
		createTrack,
		rippleEnabled = false,
	}: {
		sourceTrackId: string;
		targetTrackId: string;
		elementId: string;
		newStartTime: number;
		createTrack?: { type: TrackType; index: number };
		rippleEnabled?: boolean;
	}) {
		super();
		this.sourceTrackId = sourceTrackId;
		this.targetTrackId = targetTrackId;
		this.elementId = elementId;
		this.newStartTime = newStartTime;
		this.createTrack = createTrack;
		this.rippleEnabled = rippleEnabled;
	}

	execute(): void {
		const editor = EditorCore.getInstance();
		this.savedState = editor.timeline.getTracks();

		const sourceTrack = this.savedState.find(
			(track) => track.id === this.sourceTrackId,
		);
		const element = sourceTrack?.elements.find(
			(trackElement) => trackElement.id === this.elementId,
		);

		if (!sourceTrack || !element) {
			throw new Error("Source track or element not found");
		}

		let targetTrack = this.savedState.find((track) => track.id === this.targetTrackId);
		let tracksToUpdate = this.savedState;
		if (!targetTrack && this.createTrack) {
			const newTrack = buildEmptyTrack({
				id: this.targetTrackId,
				type: this.createTrack.type,
			});
			tracksToUpdate = [...this.savedState];
			tracksToUpdate.splice(this.createTrack.index, 0, newTrack);
			targetTrack = newTrack;
		}
		if (!targetTrack) {
			throw new Error("Target track not found");
		}

		const validation = validateElementTrackCompatibility({
			element,
			track: targetTrack,
		});

		if (!validation.isValid) {
			throw new Error(validation.errorMessage);
		}

		const groupMembers = element.groupId
			? getGroupMembers({
					tracks: tracksToUpdate,
					groupId: element.groupId,
				}).filter(({ element: member }) => member.id !== this.elementId)
			: [];
		// the group moves as one block, so no member may start before 0
		const earliestGroupStart = Math.min(
			element.startTime,
			...groupMembers.map(({ element: member }) => member.startTime),
		);
		const requestedStartTime = Math.max(
			this.newStartTime,
			element.startTime - earliestGroupStart,
		);

		const adjustedStartTime = enforceMainTrackStart({
			tracks: tracksToUpdate,
			targetTrackId: this.targetTrackId,
			requestedStartTime,
			excludeElementId: this.elementId,
		});

		// keyframe times remain clip-local, so moving only changes element startTime.
		const movedElement: TimelineElement = {
			...element,
			startTime: adjustedStartTime,
		};

		const isSameTrack = this.sourceTrackId === this.targetTrackId;

		let updatedTracks = tracksToUpdate.map((track): TimelineTrack => {
			if (isSameTrack && track.id === this.sourceTrackId) {
				return {
					...track,
					elements: track.elements.map((trackElement) =>
						trackElement.id === this.elementId ? movedElement : trackElement,
					),
				} as typeof track;
			}

			if (track.id === this.sourceTrackId) {
				const remainingElements = track.elements.filter(
					(trackElement) => trackElement.id !== this.elementId,
				);
				const shiftedElements = this.rippleEnabled
					? rippleShiftElements({
							elements: remainingElements,
							afterTime: element.startTime,
							shiftAmount: element.duration,
						})
					: remainingElements;
				return { ...track, elements: shiftedElements } as typeof track;
			}

			if (track.id === this.targetTrackId) {
				return {
					...track,
					elements: [...track.elements, movedElement],
				} as typeof track;
			}

			return track;
		});

		const groupDelta = adjustedStartTime - element.startTime;
		if (groupMembers.length > 0 && groupDelta !== 0) {
			// grouped elements keep their tracks and shift by the same amount
			const memberIds = new Set(
				groupMembers.map(({ element: member }) => member.id),
			);
			updatedTracks = updatedTracks.map((track): TimelineTrack => {
				if (!track.elements.some(({ id }) => memberIds.has(id))) return track;
				return {
					...track,
					elements: track.elements.map((trackElement) =>
						memberIds.has(trackElement.id)
							? {
									...trackElement,
									startTime: Math.max(0, trackElement.startTime + groupDelta),
								}
							: trackElement,
					),
				} as typeof track;
			});
		}

		if (!isSameTrack) {
			const sourceTrackAfterMove = updatedTracks.find(
				(track) => track.id === this.sourceTrackId,
			);
			if (
				sourceTrackAfterMove &&
				sourceTrackAfterMove.elements.length === 0 &&
				!isMainTrack(sourceTrackAfterMove)
			) {
				updatedTracks = updatedTracks.filter(
					(track) => track.id !== this.sourceTrackId,
				);
			}
		}

		editor.timeline.updateTracks(updatedTracks);
	}

	undo(): void {
		if (this.savedState) {
			const editor = EditorCore.getInstance();
			editor.timeline.updateTracks(this.savedState);
		}
	}
}
