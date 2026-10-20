import { afterEach, describe, expect, test } from "bun:test";
import { EditorCore } from "@/core";
import type {
	AudioElement,
	StickerElement,
	TimelineTrack,
	VideoElement,
} from "@/types/timeline";
import { DEFAULT_TRANSFORM } from "@/constants/timeline-constants";
import {
	FlipElementsCommand,
	flipElementsInTracks,
} from "@/lib/commands/timeline/element/flip-elements";
import { resolveTransformAtTime } from "@/lib/animation";

const originalGetInstance = EditorCore.getInstance;

function mockTimeline({ tracks }: { tracks: TimelineTrack[] }) {
	const state = { tracks };
	(
		EditorCore as unknown as {
			getInstance: () => EditorCore;
		}
	).getInstance = () =>
		({
			timeline: {
				getTracks: () => state.tracks,
				updateTracks: (nextTracks: TimelineTrack[]) => {
					state.tracks = nextTracks;
				},
			},
		}) as unknown as EditorCore;
	return state;
}

afterEach(() => {
	(
		EditorCore as unknown as {
			getInstance: typeof EditorCore.getInstance;
		}
	).getInstance = originalGetInstance;
});

function buildVideo(id: string, transform = DEFAULT_TRANSFORM): VideoElement {
	return {
		id,
		name: "Webcam",
		type: "video",
		mediaId: "media-1",
		duration: 5,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		transform,
		opacity: 1,
	};
}

function buildSticker(): StickerElement {
	return {
		id: "sticker-1",
		name: "Sticker",
		type: "sticker",
		stickerId: "mdi:star",
		duration: 5,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		transform: DEFAULT_TRANSFORM,
		opacity: 1,
	};
}

function buildAudio(): AudioElement {
	return {
		id: "audio-1",
		name: "Music",
		type: "audio",
		sourceType: "upload",
		mediaId: "media-2",
		duration: 5,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		volume: 1,
	};
}

function buildTracks({ videos }: { videos: VideoElement[] }): TimelineTrack[] {
	return [
		{
			id: "video-track",
			name: "Main",
			type: "video",
			elements: videos,
			isMain: true,
			muted: false,
			hidden: false,
		},
		{
			id: "sticker-track",
			name: "Stickers",
			type: "sticker",
			elements: [buildSticker()],
			hidden: false,
		},
		{
			id: "audio-track",
			name: "Audio",
			type: "audio",
			elements: [buildAudio()],
			muted: false,
		},
	];
}

function transformOf(
	tracks: TimelineTrack[],
	trackId: string,
	elementId: string,
) {
	const element = tracks
		.find((track) => track.id === trackId)
		?.elements.find((candidate) => candidate.id === elementId);
	if (!element || !("transform" in element)) {
		throw new Error(`No visual element ${elementId}`);
	}
	return element.transform;
}

describe("flipElementsInTracks", () => {
	test("flips one axis and leaves the other alone", () => {
		const tracks = buildTracks({ videos: [buildVideo("video-1")] });
		const flipped = flipElementsInTracks({
			tracks,
			elements: [{ trackId: "video-track", elementId: "video-1" }],
			axis: "horizontal",
		});

		const transform = transformOf(flipped, "video-track", "video-1");
		expect(transform.flipX).toBe(true);
		expect(transform.flipY).toBeUndefined();
		expect(transform.rotate).toBe(DEFAULT_TRANSFORM.rotate);
		// The untouched track keeps its identity
		expect(flipped[1]).toBe(tracks[1]);
	});

	test("flipping twice restores the saved shape", () => {
		const tracks = buildTracks({ videos: [buildVideo("video-1")] });
		const target = [{ trackId: "video-track", elementId: "video-1" }];
		const once = flipElementsInTracks({
			tracks,
			elements: target,
			axis: "vertical",
		});
		const twice = flipElementsInTracks({
			tracks: once,
			elements: target,
			axis: "vertical",
		});

		expect(transformOf(once, "video-track", "video-1").flipY).toBe(true);
		expect(transformOf(twice, "video-track", "video-1")).toEqual(
			DEFAULT_TRANSFORM,
		);
	});

	test("a mixed selection ends up all flipped", () => {
		const tracks = buildTracks({
			videos: [
				buildVideo("video-1", { ...DEFAULT_TRANSFORM, flipX: true }),
				buildVideo("video-2"),
			],
		});
		const flipped = flipElementsInTracks({
			tracks,
			elements: [
				{ trackId: "video-track", elementId: "video-1" },
				{ trackId: "video-track", elementId: "video-2" },
				{ trackId: "sticker-track", elementId: "sticker-1" },
			],
			axis: "horizontal",
		});

		expect(transformOf(flipped, "video-track", "video-1").flipX).toBe(true);
		expect(transformOf(flipped, "video-track", "video-2").flipX).toBe(true);
		expect(transformOf(flipped, "sticker-track", "sticker-1").flipX).toBe(true);
	});

	test("audio-only selections change nothing", () => {
		const tracks = buildTracks({ videos: [buildVideo("video-1")] });
		const result = flipElementsInTracks({
			tracks,
			elements: [{ trackId: "audio-track", elementId: "audio-1" }],
			axis: "horizontal",
		});

		expect(result).toBe(tracks);
	});
});

describe("FlipElementsCommand", () => {
	test("undo puts the element back unflipped", () => {
		const state = mockTimeline({
			tracks: buildTracks({ videos: [buildVideo("video-1")] }),
		});
		const command = new FlipElementsCommand(
			[{ trackId: "video-track", elementId: "video-1" }],
			"horizontal",
		);

		command.execute();
		expect(transformOf(state.tracks, "video-track", "video-1").flipX).toBe(
			true,
		);

		command.undo();
		expect(
			transformOf(state.tracks, "video-track", "video-1").flipX,
		).toBeUndefined();

		command.redo();
		expect(transformOf(state.tracks, "video-track", "video-1").flipX).toBe(
			true,
		);
	});
});

describe("resolveTransformAtTime", () => {
	test("keeps flips while scale is animated", () => {
		const transform = resolveTransformAtTime({
			baseTransform: { ...DEFAULT_TRANSFORM, flipX: true, flipY: true },
			animations: {
				channels: {
					"transform.scale": {
						valueKind: "number",
						keyframes: [
							{ id: "a", time: 0, value: 1, interpolation: "linear" },
							{ id: "b", time: 2, value: 2, interpolation: "linear" },
						],
					},
				},
			},
			localTime: 1,
		});

		expect(transform.scale).toBe(1.5);
		expect(transform.flipX).toBe(true);
		expect(transform.flipY).toBe(true);
	});
});
