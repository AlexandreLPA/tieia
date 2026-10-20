import { Command } from "@/lib/commands/base-command";
import { EditorCore } from "@/core";
import type { TimelineTrack } from "@/types/timeline";
import { generateUUID } from "@/utils/id";
import { expandRefsToGroups } from "@/lib/timeline/group-utils";

type ElementRef = { trackId: string; elementId: string };

/**
 * Groups elements like Clipchamp does: they keep their tracks and times and
 * share a groupId, so selecting, moving or duplicating one takes the rest
 * along. Grouping elements that already belong to groups merges them.
 */
export class GroupElementsCommand extends Command {
	private savedState: TimelineTrack[] | null = null;
	private previousSelection: ElementRef[] = [];
	private readonly groupId = generateUUID();

	constructor(private readonly elements: ElementRef[]) {
		super();
	}

	execute(): void {
		const editor = EditorCore.getInstance();
		this.savedState = editor.timeline.getTracks();
		this.previousSelection = editor.selection.getSelectedElements();

		const refs = expandRefsToGroups({
			tracks: this.savedState,
			elements: this.elements,
		});
		if (refs.length < 2) return;

		editor.timeline.updateTracks(
			setGroupId({ tracks: this.savedState, refs, groupId: this.groupId }),
		);
		editor.selection.setSelectedElements({ elements: refs });
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

	getGroupId(): string {
		return this.groupId;
	}
}

/** Dissolves every group touched by the given elements. */
export class UngroupElementsCommand extends Command {
	private savedState: TimelineTrack[] | null = null;
	private previousSelection: ElementRef[] = [];

	constructor(private readonly elements: ElementRef[]) {
		super();
	}

	execute(): void {
		const editor = EditorCore.getInstance();
		this.savedState = editor.timeline.getTracks();
		this.previousSelection = editor.selection.getSelectedElements();

		const refs = expandRefsToGroups({
			tracks: this.savedState,
			elements: this.elements,
		});

		editor.timeline.updateTracks(
			setGroupId({ tracks: this.savedState, refs, groupId: undefined }),
		);
		// the former members stay selected, now as independent elements
		editor.selection.setSelectedElements({ elements: refs });
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

function setGroupId({
	tracks,
	refs,
	groupId,
}: {
	tracks: TimelineTrack[];
	refs: ElementRef[];
	groupId: string | undefined;
}): TimelineTrack[] {
	return tracks.map((track) => {
		const ids = new Set(
			refs
				.filter(({ trackId }) => trackId === track.id)
				.map(({ elementId }) => elementId),
		);
		if (ids.size === 0) return track;
		return {
			...track,
			elements: track.elements.map((element) => {
				if (!ids.has(element.id)) return element;
				if (groupId) return { ...element, groupId };
				const { groupId: _removed, ...ungrouped } = element;
				return ungrouped;
			}),
		} as TimelineTrack;
	});
}
