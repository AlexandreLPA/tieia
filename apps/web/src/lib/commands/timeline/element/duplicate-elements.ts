import { Command } from "@/lib/commands/base-command";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";
import { generateUUID } from "@/utils/id";
import { EditorCore } from "@/core";
import {
	buildEmptyTrack,
	getHighestInsertIndexForTrack,
} from "@/lib/timeline/track-utils";
import { cloneAnimations } from "@/lib/animation";
import {
	createGroupIdRemapper,
	expandRefsToGroups,
} from "@/lib/timeline/group-utils";

interface DuplicateElementsParams {
	elements: { trackId: string; elementId: string }[];
}

export class DuplicateElementsCommand extends Command {
	private duplicatedElements: { trackId: string; elementId: string }[] = [];
	private savedState: TimelineTrack[] | null = null;
	private previousSelection: { trackId: string; elementId: string }[] = [];
	private elements: DuplicateElementsParams["elements"];

	constructor({ elements }: DuplicateElementsParams) {
		super();
		this.elements = elements;
	}

	execute(): void {
		const editor = EditorCore.getInstance();
		this.savedState = editor.timeline.getTracks();
		this.previousSelection = editor.selection.getSelectedElements();
		this.duplicatedElements = [];

		const updatedTracks = [...this.savedState];
		// duplicating part of a group duplicates the whole group, as a new group
		const elements = expandRefsToGroups({
			tracks: this.savedState,
			elements: this.elements,
		});
		const remapGroupId = createGroupIdRemapper();

		for (const track of this.savedState) {
			const elementsToDuplicate = elements.filter(
				(elementEntry) => elementEntry.trackId === track.id,
			);

			if (elementsToDuplicate.length === 0) {
				continue;
			}

			const elementIdsToDuplicate = new Set(
				elementsToDuplicate.map((element) => element.elementId),
			);
			const newTrackElements: TimelineElement[] = [];

			const newTrackId = generateUUID();
			const newTrackBase = buildEmptyTrack({
				id: newTrackId,
				type: track.type,
			});

			for (const element of track.elements) {
				if (!elementIdsToDuplicate.has(element.id)) {
					continue;
				}

				const newId = generateUUID();
				this.duplicatedElements.push({
					trackId: newTrackId,
					elementId: newId,
				});
				newTrackElements.push(
					buildDuplicateElement({
						element,
						id: newId,
						startTime: element.startTime,
						groupId: remapGroupId(element.groupId),
					}),
				);
			}

			const newTrack = {
				...newTrackBase,
				elements: newTrackElements,
			} as TimelineTrack;

			const insertIndex = getHighestInsertIndexForTrack({
				tracks: updatedTracks,
				trackType: track.type,
			});
			updatedTracks.splice(insertIndex, 0, newTrack);
		}

		editor.timeline.updateTracks(updatedTracks);

		if (this.duplicatedElements.length > 0) {
			editor.selection.setSelectedElements({
				elements: this.duplicatedElements,
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

	getDuplicatedElements(): { trackId: string; elementId: string }[] {
		return this.duplicatedElements;
	}
}

function buildDuplicateElement({
	element,
	id,
	startTime,
	groupId,
}: {
	element: TimelineElement;
	id: string;
	startTime: number;
	groupId: string | undefined;
}): TimelineElement {
	return {
		...element,
		id,
		name: `${element.name} (copy)`,
		startTime,
		groupId,
		animations: cloneAnimations({
			animations: element.animations,
			shouldRegenerateKeyframeIds: true,
		}),
	};
}
