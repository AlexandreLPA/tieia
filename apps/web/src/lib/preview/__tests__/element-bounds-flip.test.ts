import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getElementBounds } from "@/lib/preview/element-bounds";
import { DEFAULT_TEXT_ELEMENT } from "@/constants/text-constants";
import type { TextElement } from "@/types/timeline";

const originalDocument = globalThis.document;

beforeAll(() => {
	// Text bounds measure with a canvas; every glyph is 10 px wide here
	const context = {
		font: "",
		textAlign: "left",
		letterSpacing: "0px",
		measureText: (text: string) => ({
			width: text.length * 10,
			actualBoundingBoxAscent: 8,
			actualBoundingBoxDescent: 2,
		}),
	};
	globalThis.document = {
		createElement: () => ({ getContext: () => context }),
	} as unknown as Document;
});

afterAll(() => {
	globalThis.document = originalDocument;
});

function boundsOf(element: TextElement) {
	const bounds = getElementBounds({
		element,
		canvasSize: { width: 1000, height: 1000 },
		localTime: 0,
	});
	if (!bounds) throw new Error("No bounds");
	return bounds;
}

describe("text bounds with flips", () => {
	const leftAligned: TextElement = {
		...DEFAULT_TEXT_ELEMENT,
		id: "text-1",
		content: "Hello",
		textAlign: "left",
	};

	test("left-aligned text sits right of its anchor", () => {
		expect(boundsOf(leftAligned).cx).toBeGreaterThan(500);
	});

	test("flipX moves the box to the other side of the anchor", () => {
		const plain = boundsOf(leftAligned);
		const flipped = boundsOf({
			...leftAligned,
			transform: { ...leftAligned.transform, flipX: true },
		});

		expect(flipped.cx).toBeCloseTo(1000 - plain.cx);
		expect(flipped.cy).toBeCloseTo(plain.cy);
		expect(flipped.width).toBe(plain.width);
		expect(flipped.height).toBe(plain.height);
	});

	test("flipY mirrors the vertical offset", () => {
		const plain = boundsOf(leftAligned);
		const flipped = boundsOf({
			...leftAligned,
			transform: { ...leftAligned.transform, flipY: true },
		});

		expect(flipped.cx).toBeCloseTo(plain.cx);
		expect(flipped.cy - 500).toBeCloseTo(-(plain.cy - 500));
	});
});
