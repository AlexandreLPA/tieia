import { YouTubeClient } from "./youtube";
import type {
	EmbedTextResult,
	EmbedTextsResult,
	EmbedFramesResult,
	ZeroShotResult,
	ClipServiceHealthResult,
} from "./types";

/** Visual and semantic search over CLIP embeddings. */
export class SearchClient extends YouTubeClient {
	/** Embed a natural-language query into a 512-dim L2-normalized vector. */
	async embedText(query: string): Promise<EmbedTextResult> {
		return this.request<EmbedTextResult>("/api/search/embed-text", {
			method: "POST",
			body: JSON.stringify({ text: query }),
		});
	}

	/** Embed a batch of natural-language queries into 512-dim vectors. */
	async embedTexts(texts: string[]): Promise<EmbedTextsResult> {
		return this.request<EmbedTextsResult>("/api/search/embed-texts", {
			method: "POST",
			body: JSON.stringify({ texts }),
		});
	}

	/**
	 * Embed a batch of video frames into 512-dim vectors. `formData` must
	 * contain one or more `files` entries (JPEG/PNG blobs sampled from a
	 * media asset).
	 */
	async embedFrames(formData: FormData): Promise<EmbedFramesResult> {
		return this.requestFormData<EmbedFramesResult>(
			"/api/search/embed-frames",
			formData,
			300_000,
		);
	}

	/**
	 * Zero-shot classification: rank candidate `labels` for the image in
	 * `formData`. Used for auto-tagging on import.
	 */
	async zeroShotTags(
		formData: FormData,
		labels: readonly string[],
	): Promise<ZeroShotResult> {
		formData.append("labels", labels.join(","));
		return this.requestFormData<ZeroShotResult>(
			"/api/search/zero-shot-tags",
			formData,
		);
	}

	/** Health-check the downstream CLIP service (used by Settings panel). */
	async clipServiceHealth(): Promise<ClipServiceHealthResult> {
		return this.request<ClipServiceHealthResult>("/api/search/health");
	}
}
