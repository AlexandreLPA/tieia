import {
	EXPORT_MIME_TYPES,
	EXPORT_RESOLUTION_SHORT_SIDE,
} from "@/constants/export-constants";
import type { ExportFormat, ExportResolution } from "@/types/export";

export function isAudioOnlyExportFormat({
	format,
}: {
	format: ExportFormat;
}): boolean {
	return format === "m4a";
}

// H.264 encodes 4:2:0 chroma, so both sides must be even
function roundToEven(value: number): number {
	return Math.max(2, Math.round(value / 2) * 2);
}

export function getExportDimensions({
	canvasSize,
	resolution = "original",
}: {
	canvasSize: { width: number; height: number };
	resolution?: ExportResolution;
}): { width: number; height: number } {
	if (resolution === "original") {
		return {
			width: roundToEven(canvasSize.width),
			height: roundToEven(canvasSize.height),
		};
	}

	const shortSide = EXPORT_RESOLUTION_SHORT_SIDE[resolution];
	const scale = shortSide / Math.min(canvasSize.width, canvasSize.height);
	return {
		width: roundToEven(canvasSize.width * scale),
		height: roundToEven(canvasSize.height * scale),
	};
}

export function getExportMimeType({
	format,
}: {
	format: ExportFormat;
}): string {
	return EXPORT_MIME_TYPES[format];
}

export function getExportFileExtension({
	format,
}: {
	format: ExportFormat;
}): string {
	return `.${format}`;
}

export function downloadBuffer({
	buffer,
	filename,
	mimeType,
}: {
	buffer: ArrayBuffer;
	filename: string;
	mimeType: string;
}): void {
	const blob = new Blob([buffer], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const downloadLink = document.createElement("a");
	downloadLink.href = url;
	downloadLink.download = filename;
	document.body.appendChild(downloadLink);
	downloadLink.click();
	document.body.removeChild(downloadLink);
	URL.revokeObjectURL(url);
}
