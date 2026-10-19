import type {
	VideoGenRequest,
	VideoGenResult,
	PromptGenResult,
} from "@/types/ai";
import { TurboQuantClient } from "./turboquant";

/** Text-to-video generation jobs. */
export class VideoClient extends TurboQuantClient {
	/** Generate a video prompt from a template description using the LLM. */
	async generateVideoPrompt(
		title: string,
		description: string,
		style?: string,
	): Promise<PromptGenResult> {
		return this.requestWithKeepalive<PromptGenResult>(
			"/api/video/generate-prompt",
			{
				method: "POST",
				body: JSON.stringify({ title, description, style }),
			},
		);
	}

	/** Start video generation using the given prompt and provider. */
	async generateVideo(request: VideoGenRequest): Promise<VideoGenResult> {
		return this.requestWithKeepalive<VideoGenResult>("/api/video/generate", {
			method: "POST",
			headers: { ...this.videoHeaders(request.provider) },
			body: JSON.stringify(request),
		});
	}

	/** Poll a video generation job for status. */
	async getVideoJob(
		jobId: string,
		provider: string = "seedance",
	): Promise<VideoGenResult> {
		return this.request<VideoGenResult>(`/api/video/jobs/${jobId}`, {
			headers: { ...this.videoHeaders(provider) },
		});
	}
}
