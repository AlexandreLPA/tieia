import type {
	ExportFormat,
	ExportOptions,
	ExportQuality,
	ExportResolution,
	ExportResult,
} from "@/types/export";
import { getExportFileExtension } from "@/lib/export";
import { generateUUID } from "@/utils/id";

export interface ExportPreset {
	id: string;
	name: string;
	format: ExportFormat;
	quality: ExportQuality;
	// Audio-only formats ignore it; the aspect ratio always follows the project
	resolution?: ExportResolution;
	description: string;
}

export const PLATFORM_PRESETS: ExportPreset[] = [
	{
		id: "youtube-1080",
		name: "YouTube 1080p",
		format: "mp4",
		quality: "high",
		resolution: "1080p",
		description: "MP4 (H.264), 1080p",
	},
	{
		id: "youtube-4k",
		name: "YouTube 4K",
		format: "mp4",
		quality: "very_high",
		resolution: "4k",
		description: "MP4 (H.264), 4K",
	},
	{
		id: "tiktok-reels",
		name: "TikTok / Reels",
		format: "mp4",
		quality: "high",
		resolution: "1080p",
		description: "MP4 1080p, ideal em projeto 9:16",
	},
	{
		id: "instagram",
		name: "Instagram",
		format: "mp4",
		quality: "high",
		resolution: "1080p",
		description: "MP4 1080p, feed, stories e reels",
	},
	{
		id: "twitter",
		name: "Twitter / X",
		format: "mp4",
		quality: "medium",
		resolution: "720p",
		description: "MP4 720p, máx. 2min20s",
	},
	{
		id: "podcast-audio",
		name: "Podcast (Somente Áudio)",
		format: "m4a",
		quality: "high",
		description: "M4A (AAC), sem vídeo",
	},
	{
		id: "web-email",
		name: "Web / E-mail",
		format: "webm",
		quality: "medium",
		resolution: "720p",
		description: "WebM 720p, arquivo pequeno",
	},
];

export function getPresetExportOptions({
	preset,
}: {
	preset: ExportPreset;
}): ExportOptions {
	return {
		format: preset.format,
		quality: preset.quality,
		resolution: preset.resolution,
		includeAudio: true,
	};
}

// Preset names contain "/", which is not allowed in file names
export function getPresetExportFilename({
	projectName,
	preset,
}: {
	projectName: string;
	preset: ExportPreset;
}): string {
	const baseName = `${projectName} - ${preset.name}`
		.replace(/\s*[\\/:*?"<>|]+\s*/g, " - ")
		.trim();
	return `${baseName}${getExportFileExtension({ format: preset.format })}`;
}

export interface ExportQueueItem {
	id: string;
	preset: ExportPreset;
	status: "queued" | "exporting" | "completed" | "error";
	progress: number;
	error?: string;
	startedAt?: number;
	completedAt?: number;
}

export function createQueueItem(preset: ExportPreset): ExportQueueItem {
	return {
		id: generateUUID(),
		preset,
		status: "queued",
		progress: 0,
	};
}

// Exports the items one at a time; a failed item doesn't stop the rest
export async function runExportQueue({
	items,
	exportItem,
	saveResult,
	onItemChange,
}: {
	items: ExportQueueItem[];
	exportItem: ({ item }: { item: ExportQueueItem }) => Promise<ExportResult>;
	saveResult: ({
		item,
		buffer,
	}: {
		item: ExportQueueItem;
		buffer: ArrayBuffer;
	}) => void;
	onItemChange: ({
		id,
		changes,
	}: {
		id: string;
		changes: Partial<ExportQueueItem>;
	}) => void;
}): Promise<{ completed: number; failed: number }> {
	let completed = 0;
	let failed = 0;

	for (const item of items) {
		onItemChange({
			id: item.id,
			changes: { status: "exporting", progress: 0, startedAt: Date.now() },
		});

		let error: string | null = null;
		try {
			const result = await exportItem({ item });
			if (result.success && result.buffer) {
				saveResult({ item, buffer: result.buffer });
			} else if (result.cancelled) {
				error = "Exportação cancelada";
			} else {
				error = result.error || "Falha na exportação";
			}
		} catch (err) {
			error = err instanceof Error ? err.message : "Falha na exportação";
		}

		if (error) {
			failed += 1;
			onItemChange({
				id: item.id,
				changes: { status: "error", error, completedAt: Date.now() },
			});
		} else {
			completed += 1;
			onItemChange({
				id: item.id,
				changes: { status: "completed", progress: 100, completedAt: Date.now() },
			});
		}
	}

	return { completed, failed };
}
