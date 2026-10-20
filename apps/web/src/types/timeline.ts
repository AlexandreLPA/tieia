import type { ElementAnimations } from "./animation";
import type { Effect, EffectParamValues } from "./effects";
import type { BlendMode, Transform, CropRect, MaskShape } from "./rendering";
import type { TrackAudioEffect } from "@/lib/audio/audio-effects";

export interface TransitionData {
	type: string;
	duration: number;
}

export interface Bookmark {
	time: number;
	note?: string;
	color?: string;
	duration?: number;
}

export interface Marker {
	id: string;
	time: number;
	note?: string;
	color: string;
	createdAt: number;
}

export type MarkerColor = "red" | "yellow" | "green" | "blue" | "purple";

export interface TScene {
	id: string;
	name: string;
	isMain: boolean;
	tracks: TimelineTrack[];
	bookmarks: Bookmark[];
	markers: Marker[];
	createdAt: Date;
	updatedAt: Date;
}

export type TrackType = "video" | "text" | "audio" | "sticker" | "effect";

export type TrackColor =
	| "default"
	| "red"
	| "orange"
	| "yellow"
	| "green"
	| "blue"
	| "purple"
	| "pink";

interface BaseTrack {
	id: string;
	name: string;
	color?: TrackColor;
	locked?: boolean;
}

export interface VideoTrack extends BaseTrack {
	type: "video";
	elements: (VideoElement | ImageElement)[];
	isMain: boolean;
	muted: boolean;
	hidden: boolean;
	volume?: number;
	solo?: boolean;
	audioEffects?: TrackAudioEffect[];
}

export interface TextTrack extends BaseTrack {
	type: "text";
	elements: TextElement[];
	hidden: boolean;
}

export interface AudioTrack extends BaseTrack {
	type: "audio";
	elements: AudioElement[];
	muted: boolean;
	volume?: number;
	pan?: number;
	solo?: boolean;
	audioEffects?: TrackAudioEffect[];
}

export interface StickerTrack extends BaseTrack {
	type: "sticker";
	elements: StickerElement[];
	hidden: boolean;
}

export interface EffectTrack extends BaseTrack {
	type: "effect";
	elements: EffectElement[];
	hidden: boolean;
}

export type TimelineTrack =
	| VideoTrack
	| TextTrack
	| AudioTrack
	| StickerTrack
	| EffectTrack;

export type { Transform } from "./rendering";

interface BaseAudioElement extends BaseTimelineElement {
	type: "audio";
	volume: number;
	muted?: boolean;
	/** Playback speed multiplier. 1.0 = normal, 0.5 = half speed, 2.0 = double speed. */
	playbackRate?: number;
	/** Keep the original pitch when the speed changes. Unset means true. */
	preservePitch?: boolean;
	buffer?: AudioBuffer;
}

export interface UploadAudioElement extends BaseAudioElement {
	sourceType: "upload";
	mediaId: string;
}

export interface LibraryAudioElement extends BaseAudioElement {
	sourceType: "library";
	sourceUrl: string;
}

export type AudioElement = UploadAudioElement | LibraryAudioElement;

interface BaseTimelineElement {
	id: string;
	name: string;
	duration: number;
	startTime: number;
	trimStart: number;
	trimEnd: number;
	sourceDuration?: number;
	animations?: ElementAnimations;
	/** Seconds the clip takes to fade in from transparent/silent. Unset or 0 means none. */
	fadeIn?: number;
	/** Seconds the clip takes to fade out at its end. Unset or 0 means none. */
	fadeOut?: number;
}

export interface VideoElement extends BaseTimelineElement {
	type: "video";
	mediaId: string;
	muted?: boolean;
	hidden?: boolean;
	playbackRate?: number;
	/** Keep the original pitch when the speed changes. Unset means true. */
	preservePitch?: boolean;
	transform: Transform;
	opacity: number;
	blendMode?: BlendMode;
	effects?: Effect[];
	transitionOut?: TransitionData;
	crop?: CropRect;
	mask?: MaskShape;
}

export interface ImageElement extends BaseTimelineElement {
	type: "image";
	mediaId: string;
	hidden?: boolean;
	transform: Transform;
	opacity: number;
	blendMode?: BlendMode;
	effects?: Effect[];
	transitionOut?: TransitionData;
	crop?: CropRect;
	mask?: MaskShape;
}

export interface TextBackground {
	enabled: boolean;
	color: string;
	cornerRadius?: number;
	paddingX?: number;
	paddingY?: number;
	offsetX?: number;
	offsetY?: number;
}

export interface TextWordTiming {
	word: string;
	/** Start time relative to the element's own start (local time) */
	start: number;
	/** End time relative to the element's own start (local time) */
	end: number;
}

/** Outline drawn around each letter. Width is a percentage of the font size. */
export interface TextStroke {
	enabled: boolean;
	color: string;
	width: number;
}

/** Drop shadow. Blur and distance are percentages of the font size. */
export interface TextShadow {
	enabled: boolean;
	color: string;
	blur: number;
	offsetX: number;
	offsetY: number;
}

/**
 * How words with timings light up while spoken:
 * - "progressive": every word already spoken takes the highlight color
 * - "word": only the word being spoken takes the highlight color
 * - "box": the word being spoken gets a highlight-colored box behind it
 * - "none": no highlight
 */
export type TextHighlightStyle = "progressive" | "word" | "box" | "none";

/**
 * Per-letter look. "cutout" draws every letter on its own magazine scrap
 * (ransom-note style) in colors; "cutout-mono" in black, white and newsprint.
 */
export type TextLetterStyle = "none" | "cutout" | "cutout-mono";

/** Vertical gradient fill, top to bottom, replacing the solid text color. */
export interface TextGradient {
	from: string;
	to: string;
}

export interface TextElement extends BaseTimelineElement {
	type: "text";
	content: string;
	fontSize: number;
	fontFamily: string;
	color: string;
	/** Color used to highlight words as they are spoken (karaoke-style) */
	highlightColor?: string;
	/** Word-level timing for karaoke-style highlighting */
	wordTimings?: TextWordTiming[];
	/** Scale multiplier for the currently-spoken word (pop effect). 1.0 = no pop, 1.3 = 30% larger. */
	wordPopScale?: number;
	/** Unset means "progressive", the original karaoke behavior */
	highlightStyle?: TextHighlightStyle;
	stroke?: TextStroke;
	shadow?: TextShadow;
	letterStyle?: TextLetterStyle;
	/** Fixes the per-letter randomness so preview and export always match */
	letterSeed?: number;
	fillGradient?: TextGradient;
	background: TextBackground;
	textAlign: "left" | "center" | "right";
	fontWeight: "normal" | "bold";
	fontStyle: "normal" | "italic";
	textDecoration: "none" | "underline" | "line-through";
	letterSpacing?: number;
	lineHeight?: number;
	hidden?: boolean;
	transform: Transform;
	opacity: number;
	blendMode?: BlendMode;
	effects?: Effect[];
	transitionOut?: TransitionData;
	crop?: CropRect;
	mask?: MaskShape;
}

export interface StickerElement extends BaseTimelineElement {
	type: "sticker";
	stickerId: string;
	hidden?: boolean;
	transform: Transform;
	opacity: number;
	blendMode?: BlendMode;
	effects?: Effect[];
	transitionOut?: TransitionData;
	crop?: CropRect;
	mask?: MaskShape;
}

export interface EffectElement extends BaseTimelineElement {
	type: "effect";
	effectType: string;
	params: EffectParamValues;
}

export type VisualElement =
	| VideoElement
	| ImageElement
	| TextElement
	| StickerElement;

export type ElementUpdatePatch =
	| { transform: Transform }
	| { opacity: number }
	| { volume: number };

export type TimelineElement =
	| AudioElement
	| VideoElement
	| ImageElement
	| TextElement
	| StickerElement
	| EffectElement;

export type ElementType = TimelineElement["type"];

export type CreateUploadAudioElement = Omit<UploadAudioElement, "id">;
export type CreateLibraryAudioElement = Omit<LibraryAudioElement, "id">;
export type CreateAudioElement =
	| CreateUploadAudioElement
	| CreateLibraryAudioElement;
export type CreateVideoElement = Omit<VideoElement, "id">;
export type CreateImageElement = Omit<ImageElement, "id">;
export type CreateTextElement = Omit<TextElement, "id">;
export type CreateStickerElement = Omit<StickerElement, "id">;
export type CreateEffectElement = Omit<EffectElement, "id">;
export type CreateTimelineElement =
	| CreateAudioElement
	| CreateVideoElement
	| CreateImageElement
	| CreateTextElement
	| CreateStickerElement
	| CreateEffectElement;

export interface ElementDragState {
	isDragging: boolean;
	elementId: string | null;
	trackId: string | null;
	startMouseX: number;
	startMouseY: number;
	startElementTime: number;
	clickOffsetTime: number;
	currentTime: number;
	currentMouseY: number;
}

export interface DropTarget {
	trackIndex: number;
	isNewTrack: boolean;
	insertPosition: "above" | "below" | null;
	xPosition: number;
	targetElement: { elementId: string; trackId: string } | null;
}

export interface ComputeDropTargetParams {
	elementType: ElementType;
	mouseX: number;
	mouseY: number;
	tracks: TimelineTrack[];
	playheadTime: number;
	isExternalDrop: boolean;
	elementDuration: number;
	pixelsPerSecond: number;
	zoomLevel: number;
	verticalDragDirection?: "up" | "down" | null;
	startTimeOverride?: number;
	excludeElementId?: string;
	targetElementTypes?: string[];
}

export interface ClipboardItem {
	trackId: string;
	trackType: TrackType;
	element: CreateTimelineElement;
}

export interface CompoundClip extends BaseTimelineElement {
	type: "compound";
	innerTracks: TimelineTrack[];
	name: string;
	transform: Transform;
	opacity: number;
	blendMode?: BlendMode;
	effects?: Effect[];
	transitionOut?: TransitionData;
	crop?: CropRect;
	mask?: MaskShape;
}
