import { afterEach, describe, expect, test } from "bun:test";
import { EditorCore } from "@/core";
import type {
	TextElement,
	TimelineTrack,
	VideoElement,
} from "@/types/timeline";
import { DEFAULT_TRANSFORM } from "@/constants/timeline-constants";
import {
	GroupElementsCommand,
	UngroupElementsCommand,
} from "@/lib/commands/timeline/element/group-elements";
import { MoveElementCommand } from "@/lib/commands/timeline/element/move-elements";
import { DuplicateElementsCommand } from "@/lib/commands/timeline/element/duplicate-elements";
import { SplitElementsCommand } from "@/lib/commands/timeline/element/split-elements";
import { SelectionManager } from "@/core/managers/selection-manager";
import { expandRefsToGroups } from "@/lib/timeline/group-utils";

type ElementRef = { trackId: string; elementId: string };

const originalGetInstance = EditorCore.getInstance;

/** In-memory editor whose timeline and selection behave like the real ones. */
function mockEditor({ tracks }: { tracks: TimelineTrack[] }) {
	const state = { tracks, selection: [] as ElementRef[] };
	const editor = {
		timeline: {
			getTracks: () => state.tracks,
			updateTracks: (next: TimelineTrack[]) => {
				state.tracks = next;
			},
		},
		selection: {
			getSelectedElements: () => state.selection,
			setSelectedElements: ({ elements }: { elements: ElementRef[] }) => {
				state.selection = expandRefsToGroups({
					tracks: state.tracks,
					elements,
				});
			},
		},
	};
	(
		EditorCore as unknown as { getInstance: () => EditorCore }
	).getInstance = () => editor as unknown as EditorCore;
	return state;
}

afterEach(() => {
	(
		EditorCore as unknown as { getInstance: typeof EditorCore.getInstance }
	).getInstance = originalGetInstance;
});

function video(id: string, startTime: number): VideoElement {
	return {
		id,
		name: id,
		type: "video",
		mediaId: `media-${id}`,
		duration: 4,
		startTime,
		trimStart: 0,
		trimEnd: 0,
		transform: DEFAULT_TRANSFORM,
		opacity: 1,
	};
}

// only the fields the grouping commands read; styling is irrelevant here
function text(id: string, startTime: number): TextElement {
	return {
		id,
		name: id,
		type: "text",
		content: id,
		fontSize: 48,
		fontFamily: "Arial",
		color: "#ffffff",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		duration: 2,
		startTime,
		trimStart: 0,
		trimEnd: 0,
		transform: DEFAULT_TRANSFORM,
		opacity: 1,
	} as unknown as TextElement;
}

function buildTracks(): TimelineTrack[] {
	return [
		{
			id: "text-track",
			name: "Text",
			type: "text",
			elements: [text("title", 1), text("other-text", 10)],
			hidden: false,
		},
		{
			id: "main",
			name: "Main",
			type: "video",
			elements: [video("clip-a", 0), video("clip-b", 4)],
			isMain: true,
			muted: false,
			hidden: false,
		},
	] as TimelineTrack[];
}

function find(tracks: TimelineTrack[], id: string) {
	for (const track of tracks) {
		const element = track.elements.find((e) => e.id === id);
		if (element) return { track, element };
	}
	throw new Error(`element ${id} not found`);
}

const TITLE = { trackId: "text-track", elementId: "title" };
const CLIP_B = { trackId: "main", elementId: "clip-b" };

describe("grouping", () => {
	test("grouping keeps every element in place and shares one groupId", () => {
		const state = mockEditor({ tracks: buildTracks() });
		const before = structuredClone(state.tracks);

		new GroupElementsCommand([TITLE, CLIP_B]).execute();

		const title = find(state.tracks, "title");
		const clipB = find(state.tracks, "clip-b");
		expect(title.element.groupId).toBeDefined();
		expect(clipB.element.groupId).toBe(title.element.groupId);
		expect(title.track.id).toBe("text-track");
		expect(clipB.track.id).toBe("main");
		expect(title.element.startTime).toBe(1);
		expect(clipB.element.startTime).toBe(4);
		expect(find(state.tracks, "clip-a").element.groupId).toBeUndefined();
		// nothing removed, nothing added
		expect(state.tracks.map((t) => t.elements.length)).toEqual(
			before.map((t) => t.elements.length),
		);
	});

	test("undo restores the ungrouped timeline", () => {
		const state = mockEditor({ tracks: buildTracks() });
		const command = new GroupElementsCommand([TITLE, CLIP_B]);
		command.execute();
		command.undo();
		expect(find(state.tracks, "title").element.groupId).toBeUndefined();
		expect(find(state.tracks, "clip-b").element.groupId).toBeUndefined();
	});

	test("selecting one member selects the whole group", () => {
		const state = mockEditor({ tracks: buildTracks() });
		new GroupElementsCommand([TITLE, CLIP_B]).execute();

		const selection = new SelectionManager(
			EditorCore.getInstance() as EditorCore,
		);
		selection.setSelectedElements({ elements: [TITLE] });
		expect(selection.getSelectedElements()).toEqual([TITLE, CLIP_B]);
		void state;
	});

	test("moving one member shifts the rest of the group by the same amount", () => {
		const state = mockEditor({ tracks: buildTracks() });
		new GroupElementsCommand([TITLE, CLIP_B]).execute();

		const move = new MoveElementCommand({
			sourceTrackId: "text-track",
			targetTrackId: "text-track",
			elementId: "title",
			newStartTime: 3,
		});
		move.execute();

		expect(find(state.tracks, "title").element.startTime).toBe(3);
		expect(find(state.tracks, "clip-b").element.startTime).toBe(6);
		expect(find(state.tracks, "clip-a").element.startTime).toBe(0);
		expect(find(state.tracks, "other-text").element.startTime).toBe(10);

		move.undo();
		expect(find(state.tracks, "title").element.startTime).toBe(1);
		expect(find(state.tracks, "clip-b").element.startTime).toBe(4);
	});

	test("a group cannot be dragged before time 0", () => {
		const state = mockEditor({ tracks: buildTracks() });
		new GroupElementsCommand([TITLE, CLIP_B]).execute();

		new MoveElementCommand({
			sourceTrackId: "main",
			targetTrackId: "main",
			elementId: "clip-b",
			newStartTime: 2,
		}).execute();

		// title starts at 1, so the whole block can only move back by 1
		expect(find(state.tracks, "title").element.startTime).toBe(0);
		expect(find(state.tracks, "clip-b").element.startTime).toBe(3);
	});

	test("duplicating one member duplicates the group as a new group", () => {
		const state = mockEditor({ tracks: buildTracks() });
		new GroupElementsCommand([TITLE, CLIP_B]).execute();
		const groupId = find(state.tracks, "title").element.groupId;

		const duplicate = new DuplicateElementsCommand({ elements: [TITLE] });
		duplicate.execute();

		const copies = duplicate
			.getDuplicatedElements()
			.map(({ elementId }) => find(state.tracks, elementId).element);
		expect(copies.map((c) => c.name).sort()).toEqual([
			"clip-b (copy)",
			"title (copy)",
		]);
		expect(copies[0].groupId).toBeDefined();
		expect(copies[0].groupId).not.toBe(groupId);
		expect(copies[1].groupId).toBe(copies[0].groupId);
		expect(state.selection).toHaveLength(2);
	});

	test("splitting a group leaves the right pieces in a group of their own", () => {
		const state = mockEditor({ tracks: buildTracks() });
		new GroupElementsCommand([TITLE, CLIP_B]).execute();
		const groupId = find(state.tracks, "title").element.groupId;

		const split = new SplitElementsCommand({
			elements: [TITLE, CLIP_B],
			splitTime: 2.5,
		});
		split.execute();

		const rights = split
			.getRightSideElements()
			.map(({ elementId }) => find(state.tracks, elementId).element);
		expect(rights).toHaveLength(1);
		expect(rights[0].groupId).toBeDefined();
		expect(rights[0].groupId).not.toBe(groupId);
		expect(find(state.tracks, "title").element.groupId).toBe(groupId);
	});

	test("ungrouping one member dissolves the whole group, with undo", () => {
		const state = mockEditor({ tracks: buildTracks() });
		new GroupElementsCommand([TITLE, CLIP_B]).execute();

		const ungroup = new UngroupElementsCommand([TITLE]);
		ungroup.execute();
		expect(find(state.tracks, "title").element.groupId).toBeUndefined();
		expect(find(state.tracks, "clip-b").element.groupId).toBeUndefined();
		expect("groupId" in find(state.tracks, "clip-b").element).toBe(false);

		ungroup.undo();
		expect(find(state.tracks, "clip-b").element.groupId).toBe(
			find(state.tracks, "title").element.groupId,
		);
	});

	test("grouping members of two groups merges them into one", () => {
		const state = mockEditor({ tracks: buildTracks() });
		new GroupElementsCommand([TITLE, CLIP_B]).execute();
		new GroupElementsCommand([
			{ trackId: "text-track", elementId: "other-text" },
			{ trackId: "main", elementId: "clip-a" },
		]).execute();

		new GroupElementsCommand([
			TITLE,
			{ trackId: "main", elementId: "clip-a" },
		]).execute();

		const ids = ["title", "clip-b", "other-text", "clip-a"].map(
			(id) => find(state.tracks, id).element.groupId,
		);
		expect(new Set(ids).size).toBe(1);
		expect(ids[0]).toBeDefined();
	});
});
