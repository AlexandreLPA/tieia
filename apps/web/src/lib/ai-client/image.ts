import type {
	ImageGenParams,
	ImageGenResult,
	InfographicData,
} from "@/types/ai";
import { AnalysisClient } from "./analysis";
import { REQUEST_TIMEOUT_MS } from "./core";
import type { VideoBgJobStatus, BRollAssetEmbedding } from "./types";

/** Image generation, background removal and B-roll embeddings. */
export class ImageClient extends AnalysisClient {
	async generateImage(params: ImageGenParams): Promise<ImageGenResult> {
		return this.request<ImageGenResult>("/api/generate/image", {
			method: "POST",
			body: JSON.stringify(params),
		});
	}

	async enhancePrompt(
		prompt: string,
		style?: string,
	): Promise<{ enhanced: string; original: string; style: string }> {
		return this.requestWithKeepalive<{
			enhanced: string;
			original: string;
			style: string;
		}>("/api/generate/enhance-prompt", {
			method: "POST",
			body: JSON.stringify({ prompt, style: style ?? "photorealistic" }),
		});
	}

	async generateInfographic(
		topic: string,
		dataPoints?: { label: string; value: string }[],
		style?: string,
	): Promise<InfographicData> {
		return this.request<InfographicData>("/api/generate/infographic", {
			method: "POST",
			body: JSON.stringify({
				topic,
				data_points: dataPoints ?? [],
				style: style ?? "modern",
			}),
		});
	}

	async removeBackground(file: File): Promise<{ imageUrl: string }> {
		const formData = new FormData();
		formData.append("file", file);

		return this.requestFormData<{ imageUrl: string }>(
			"/api/generate/remove-bg",
			formData,
		);
	}

	/**
	 * Start a per-frame background-removal job on a video clip. Returns a
	 * job_id; poll with {@link getVideoBgJob}. Default fps=8 (CPU-friendly).
	 * Estimate runtime as roughly ``duration * fps * ~1s`` before starting.
	 */
	async removeVideoBackground(
		file: File,
		fps: number = 8,
		maxDuration: number = 120,
	): Promise<{ job_id: string; status: string }> {
		const formData = new FormData();
		formData.append("file", file);
		formData.append("fps", String(fps));
		formData.append("max_duration", String(maxDuration));
		return this.requestFormData<{ job_id: string; status: string }>(
			"/api/background/remove-video",
			formData,
			REQUEST_TIMEOUT_MS,
		);
	}

	/** Poll a video background-removal job. The result videoUrl is a path
	 * relative to the ai-backend (use {@link videoBgFileUrl} to build it). */
	async getVideoBgJob(jobId: string): Promise<VideoBgJobStatus> {
		return this.request<VideoBgJobStatus>(`/api/background/job/${jobId}`, {
			method: "GET",
		});
	}

	/** Build a fully-qualified URL for a video-bg result path returned by the job poll. */
	videoBgFileUrl(path: string): string {
		if (/^https?:\/\//.test(path)) return path;
		return `${this.baseUrl}${path}`;
	}

	/**
	 * Index a media asset for B-roll: samples frames, embeds them via the
	 * CLIP service, and returns vectors + thumbnails. The caller persists
	 * these in IndexedDB keyed by (mediaId, timestamp). No data is stored
	 * server-side.
	 */
	async embedAssetFrames(
		file: File,
		sampleInterval: number = 2.0,
		maxFrames: number = 120,
	): Promise<BRollAssetEmbedding> {
		const formData = new FormData();
		formData.append("file", file);
		formData.append("sample_interval", String(sampleInterval));
		formData.append("max_frames", String(maxFrames));
		return this.requestFormData<BRollAssetEmbedding>(
			"/api/broll/embed-asset",
			formData,
			REQUEST_TIMEOUT_MS,
		);
	}

	/** Embed a transcript segment's text for matching against the B-roll index. */
	async embedBRollQuery(text: string): Promise<number[]> {
		const result = await this.request<{ vector: number[] }>(
			"/api/broll/embed-query",
			{ method: "POST", body: JSON.stringify({ text }) },
		);
		return result.vector;
	}
}
