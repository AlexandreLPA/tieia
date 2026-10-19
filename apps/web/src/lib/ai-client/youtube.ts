import { VideoClient } from "./video";
import type {
	YouTubeVideoMeta,
	YouTubeJobStatus,
	EngagementScoreResult,
	TikTokComplianceRequest,
	TikTokComplianceResult,
	ThumbnailScoreResponse,
	HookVariantRequest,
	HookVariantResponse,
	ScoreHistoryResponse,
	ScoreAnalyticsResponse,
} from "./types";

/** YouTube to Reels, engagement scoring and TikTok compliance. */
export class YouTubeClient extends VideoClient {
	/** Ingest a YouTube video: validate, fetch metadata, start audio download. */
	async youtubeIngest(
		url: string,
		ownershipConfirmed: boolean,
		language?: string,
	): Promise<{
		job_id: string;
		video_meta: YouTubeVideoMeta;
		estimated_processing_minutes: number;
	}> {
		return this.request("/api/youtube/ingest", {
			method: "POST",
			body: JSON.stringify({
				url,
				ownership_confirmed: ownershipConfirmed,
				language,
			}),
		});
	}

	/** Poll YouTube job status. */
	async youtubeJobStatus(jobId: string): Promise<YouTubeJobStatus> {
		return this.request(`/api/youtube/status/${jobId}`);
	}

	/** Cancel a YouTube job. */
	async youtubeCancel(jobId: string): Promise<{ status: string }> {
		return this.request(`/api/youtube/cancel/${jobId}`, { method: "POST" });
	}

	/** Run clip detection on a downloaded YouTube video. */
	async youtubeAnalyze(
		jobId: string,
		config: { minDuration?: number; maxDuration?: number; maxClips?: number },
	): Promise<{ job_id: string; message: string }> {
		return this.request("/api/youtube/analyze", {
			method: "POST",
			body: JSON.stringify({
				job_id: jobId,
				min_clip_duration: config.minDuration ?? 15,
				max_clip_duration: config.maxDuration ?? 90,
				max_clips: config.maxClips ?? 10,
			}),
		});
	}

	/** Generate selected clips as reels. */
	async youtubeGenerateClips(
		jobId: string,
		clips: { clip_index: number; start: number; end: number; title: string }[],
		config: {
			outputFormat?: string;
			captionStyle?: string;
			autoReframe?: boolean;
			addHook?: boolean;
			resolution?: string;
		},
	): Promise<{ job_id: string; message: string }> {
		return this.request("/api/youtube/clips", {
			method: "POST",
			body: JSON.stringify({
				job_id: jobId,
				selected_clips: clips,
				output_format: config.outputFormat ?? "9:16",
				caption_style: config.captionStyle ?? "modern",
				auto_reframe: config.autoReframe ?? true,
				add_hook: config.addHook ?? false,
				resolution: config.resolution ?? "1080",
			}),
		});
	}

	/** Score a single clip's engagement potential. */
	async engagementScore(clip: {
		audio_path?: string;
		transcript_text?: string;
		hook_text?: string;
		start: number;
		end: number;
		title?: string;
		video_path?: string;
	}): Promise<EngagementScoreResult> {
		return this.requestWithKeepalive("/api/engagement/score", {
			method: "POST",
			body: JSON.stringify(clip),
		});
	}

	/** Score a video file's engagement potential (audio and picture included). */
	async engagementScoreVideo(
		file: File,
		text: { transcriptText?: string; hookText?: string; title?: string } = {},
	): Promise<EngagementScoreResult> {
		const formData = new FormData();
		formData.append("file", file);
		if (text.transcriptText)
			formData.append("transcript_text", text.transcriptText);
		if (text.hookText) formData.append("hook_text", text.hookText);
		if (text.title) formData.append("title", text.title);
		// The backend streams keepalive pings while it scores
		return this.requestFormDataWithKeepalive(
			"/api/engagement/score-video",
			formData,
		);
	}

	/** Score multiple clips in batch. */
	async engagementScoreBatch(
		clips: {
			audio_path?: string;
			transcript_text?: string;
			start: number;
			end: number;
			title?: string;
		}[],
	): Promise<{ scores: EngagementScoreResult[] }> {
		return this.requestWithKeepalive("/api/engagement/score-batch", {
			method: "POST",
			body: JSON.stringify({ clips }),
		});
	}

	async scoreThumbnails(
		imageUrls: string[],
		headline?: string,
		platform?: string,
	): Promise<ThumbnailScoreResponse> {
		return this.requestWithKeepalive("/api/engagement/score-thumbnails", {
			method: "POST",
			body: JSON.stringify({
				image_urls: imageUrls,
				headline: headline ?? "",
				platform: platform ?? "youtube",
			}),
		});
	}

	async generateHookVariants(
		req: HookVariantRequest,
	): Promise<HookVariantResponse> {
		return this.requestWithKeepalive("/api/engagement/generate-hook-variants", {
			method: "POST",
			body: JSON.stringify(req),
		});
	}

	/** Check frames + transcript against the TikTok Shop rules with the active vision model. */
	async checkTikTokCompliance(
		req: TikTokComplianceRequest,
	): Promise<TikTokComplianceResult> {
		return this.requestWithKeepalive("/api/compliance/tiktok", {
			method: "POST",
			body: JSON.stringify(req),
		});
	}

	async recordScore(
		score: EngagementScoreResult & { project_id?: string; type?: string },
	): Promise<{ recorded: boolean; id: string }> {
		return this.requestWithKeepalive("/api/engagement/record-score", {
			method: "POST",
			body: JSON.stringify(score),
		});
	}

	async getScoreHistory(
		projectId?: string,
		limit?: number,
	): Promise<ScoreHistoryResponse> {
		const params = new URLSearchParams();
		if (projectId) params.set("project_id", projectId);
		if (limit) params.set("limit", String(limit));
		return this.requestWithKeepalive(
			`/api/engagement/score-history?${params.toString()}`,
		);
	}

	async getScoreAnalytics(projectId?: string): Promise<ScoreAnalyticsResponse> {
		const params = new URLSearchParams();
		if (projectId) params.set("project_id", projectId);
		return this.requestWithKeepalive(
			`/api/engagement/score-analytics?${params.toString()}`,
		);
	}
}
