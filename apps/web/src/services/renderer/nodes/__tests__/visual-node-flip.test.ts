import { describe, expect, test } from "bun:test";
import type { CanvasRenderer } from "../../canvas-renderer";
import { VisualNode } from "../visual-node";
import { DEFAULT_TRANSFORM } from "@/constants/timeline-constants";
import type { Transform } from "@/types/timeline";

type Matrix = [number, number, number, number, number, number];

/** Tracks the canvas transform the way a 2D context does */
function createRecordingContext() {
	let matrix: Matrix = [1, 0, 0, 1, 0, 0];
	const stack: Matrix[] = [];
	const draws: Array<{
		matrix: Matrix;
		x: number;
		y: number;
		w: number;
		h: number;
	}> = [];

	const context = {
		globalAlpha: 1,
		globalCompositeOperation: "source-over",
		save: () => stack.push([...matrix] as Matrix),
		restore: () => {
			matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
		},
		translate: (tx: number, ty: number) => {
			const [a, b, c, d, e, f] = matrix;
			matrix = [a, b, c, d, e + a * tx + c * ty, f + b * tx + d * ty];
		},
		scale: (sx: number, sy: number) => {
			const [a, b, c, d, e, f] = matrix;
			matrix = [a * sx, b * sx, c * sy, d * sy, e, f];
		},
		rotate: (angle: number) => {
			const [a, b, c, d, e, f] = matrix;
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			matrix = [
				a * cos + c * sin,
				b * cos + d * sin,
				-a * sin + c * cos,
				-b * sin + d * cos,
				e,
				f,
			];
		},
		drawImage: (
			_source: unknown,
			x: number,
			y: number,
			w: number,
			h: number,
		) => {
			draws.push({ matrix: [...matrix] as Matrix, x, y, w, h });
		},
	};

	return { context, draws };
}

class TestNode extends VisualNode {
	draw(renderer: CanvasRenderer) {
		this.renderVisual({
			renderer,
			source: {} as CanvasImageSource,
			sourceWidth: 100,
			sourceHeight: 50,
			timelineTime: 0,
		});
	}
}

/** Where the source image's top-left corner lands on the canvas */
function drawnTopLeft(transform: Transform): { x: number; y: number } {
	const { context, draws } = createRecordingContext();
	const renderer = {
		context,
		width: 100,
		height: 100,
	} as unknown as CanvasRenderer;
	new TestNode({
		duration: 1,
		timeOffset: 0,
		trimStart: 0,
		trimEnd: 0,
		transform,
		opacity: 1,
	}).draw(renderer);

	const [{ matrix, x, y }] = draws;
	const [a, b, c, d, e, f] = matrix;
	// "|| 0" turns -0 into 0 so toEqual compares plain numbers
	const round = (value: number) => Math.round(value * 1000) / 1000 || 0;
	return { x: round(a * x + c * y + e), y: round(b * x + d * y + f) };
}

describe("VisualNode flips", () => {
	// A 100x50 source fills a 100x100 canvas at y 25..75

	test("draws unflipped elements as before", () => {
		expect(drawnTopLeft(DEFAULT_TRANSFORM)).toEqual({ x: 0, y: 25 });
	});

	test("flipX mirrors left to right around the element center", () => {
		expect(drawnTopLeft({ ...DEFAULT_TRANSFORM, flipX: true })).toEqual({
			x: 100,
			y: 25,
		});
	});

	test("flipY mirrors top to bottom around the element center", () => {
		expect(drawnTopLeft({ ...DEFAULT_TRANSFORM, flipY: true })).toEqual({
			x: 0,
			y: 75,
		});
	});

	test("the mirror follows the element's own axes when rotated", () => {
		const rotated = { ...DEFAULT_TRANSFORM, rotate: 90 };
		expect(drawnTopLeft(rotated)).toEqual({ x: 75, y: 0 });
		expect(drawnTopLeft({ ...rotated, flipX: true })).toEqual({
			x: 75,
			y: 100,
		});
	});
});
