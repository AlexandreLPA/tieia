import { describe, expect, test } from "bun:test";
import { timelineTimeToSnappedPixels } from "@/lib/timeline";
import type { ElementKeyframe } from "@/types/animation";
import {
	KEYFRAME_INDICATOR_MIN_WIDTH_PX,
	getKeyframeIndicators,
} from "../keyframe-indicators";
import { getDisplayShortcut } from "../menu-items";

function keyframe(
	id: string,
	time: number,
	propertyPath = "transform.position.x",
): ElementKeyframe {
	return {
		id,
		time,
		propertyPath,
		value: 0,
		interpolation: "linear",
	} as ElementKeyframe;
}

const base = {
	trackId: "t1",
	elementId: "e1",
	displayedStartTime: 2,
	zoomLevel: 1,
	elementLeft: 10,
	elementWidth: 400,
};

describe("getKeyframeIndicators", () => {
	test("hides indicators on clips narrower than the minimum width", () => {
		const indicators = getKeyframeIndicators({
			...base,
			elementWidth: KEYFRAME_INDICATOR_MIN_WIDTH_PX - 1,
			keyframes: [keyframe("a", 1)],
		});
		expect(indicators).toEqual([]);
	});

	test("groups keyframes at the same time and sorts by time", () => {
		const indicators = getKeyframeIndicators({
			...base,
			keyframes: [
				keyframe("late", 3),
				keyframe("a", 1),
				keyframe("b", 1, "opacity"),
			],
		});
		expect(indicators.map((i) => i.time)).toEqual([1, 3]);
		expect(indicators[0].keyframes.map((k) => k.keyframeId)).toEqual([
			"a",
			"b",
		]);
		expect(indicators[0].keyframes[1]).toEqual({
			trackId: "t1",
			elementId: "e1",
			propertyPath: "opacity",
			keyframeId: "b",
		});
	});

	test("offset is measured from the clip's left edge", () => {
		const [indicator] = getKeyframeIndicators({
			...base,
			keyframes: [keyframe("a", 1)],
		});
		const expected =
			timelineTimeToSnappedPixels({ time: 3, zoomLevel: 1 }) - base.elementLeft;
		expect(indicator.offsetPx).toBe(expected);
	});
});

describe("getDisplayShortcut", () => {
	test("shows the first default shortcut in upper case", () => {
		expect(getDisplayShortcut({ action: "copy-selected" })).toBe("CTRL C");
		expect(getDisplayShortcut({ action: "delete-selected" })).toBe("BACKSPACE");
	});

	test("is empty for actions without a shortcut", () => {
		expect(getDisplayShortcut({ action: "separate-audio" })).toBe("");
	});
});
