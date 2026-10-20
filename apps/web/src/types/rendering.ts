export interface Transform {
	scale: number;
	position: {
		x: number;
		y: number;
	};
	rotate: number;
	/** Mirrors the element left to right, around its own center */
	flipX?: boolean;
	/** Mirrors the element top to bottom, around its own center */
	flipY?: boolean;
}

export interface CropRect {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export interface MaskShape {
	type: "rectangle" | "ellipse" | "polygon";
	feather: number;
	inverted: boolean;
	points?: { x: number; y: number }[];
}

export type BlendMode =
	| "normal"
	| "darken"
	| "multiply"
	| "color-burn"
	| "lighten"
	| "screen"
	| "plus-lighter"
	| "color-dodge"
	| "overlay"
	| "soft-light"
	| "hard-light"
	| "difference"
	| "exclusion"
	| "hue"
	| "saturation"
	| "color"
	| "luminosity";
