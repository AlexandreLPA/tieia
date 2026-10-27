export const EXPORT_QUALITY_VALUES = [
	"low",
	"medium",
	"high",
	"very_high",
] as const;

export const EXPORT_FORMAT_VALUES = ["mp4", "webm", "m4a"] as const;

// "original" keeps the canvas size; the others set the shorter side
export const EXPORT_RESOLUTION_VALUES = [
	"original",
	"480p",
	"720p",
	"1080p",
	"4k",
] as const;

export type ExportFormat = (typeof EXPORT_FORMAT_VALUES)[number];
export type ExportQuality = (typeof EXPORT_QUALITY_VALUES)[number];
export type ExportResolution = (typeof EXPORT_RESOLUTION_VALUES)[number];

export interface ExportOptions {
	format: ExportFormat;
	quality: ExportQuality;
	resolution?: ExportResolution;
	fps?: number;
	includeAudio?: boolean;
	/** Brings the mix to the -14 LUFS the platforms play at */
	normalizeLoudness?: boolean;
	includeWatermark?: boolean;
}

export interface ExportResult {
	success: boolean;
	buffer?: ArrayBuffer;
	error?: string;
	cancelled?: boolean;
}

export interface ExportState {
	isExporting: boolean;
	progress: number;
	result: ExportResult | null;
}
