import type {
	AISuggestion,
	BRollSuggestionsResult,
	DenoiseResult,
	EmotionDetectionResult,
	FaceDetectionResult,
	FindClipsResult,
	SpeakerDiarizationResult,
	KeywordResult,
	QuestionCardsResult,
	TranscriptionResult,
	FillerWord,
	SilenceRegion,
	StructureAnalysis,
} from "@/types/ai";
import { AIClientCore } from "./core";
import { AIClientError, classifyError } from "./core";

/** Transcription, audio/video analysis, denoise and export. */
export class AnalysisClient extends AIClientCore {
	async transcribe(
		file: File,
		language?: string,
	): Promise<TranscriptionResult> {
		const formData = new FormData();
		formData.append("file", file);
		if (language) {
			formData.append("language", language);
		}

		return this.requestFormData<TranscriptionResult>(
			"/api/transcribe",
			formData,
		);
	}

	async analyzeFillers(
		file: File,
		fillerWords?: string,
		threshold?: number,
	): Promise<{
		fillers: FillerWord[];
		total_count: number;
		duration: number;
		filler_density: number;
	}> {
		const formData = new FormData();
		formData.append("file", file);
		if (fillerWords) formData.append("filler_words", fillerWords);
		if (threshold !== undefined)
			formData.append("threshold", threshold.toString());

		return this.requestFormData("/api/analyze/fillers", formData);
	}

	async analyzeSilences(
		file: File,
		thresholdDb?: number,
		minDuration?: number,
	): Promise<{
		silences: SilenceRegion[];
		total_count: number;
		total_silence_duration: number;
	}> {
		const formData = new FormData();
		formData.append("file", file);
		if (thresholdDb !== undefined)
			formData.append("threshold_db", thresholdDb.toString());
		if (minDuration !== undefined)
			formData.append("min_duration", minDuration.toString());

		return this.requestFormData("/api/analyze/silences", formData);
	}

	async analyzeStructure(
		file: File,
		language?: string,
	): Promise<StructureAnalysis> {
		const formData = new FormData();
		formData.append("file", file);
		if (language) formData.append("language", language);

		return this.requestFormDataWithKeepalive(
			"/api/analyze/structure",
			formData,
		);
	}

	async getSuggestions(
		file: File,
		language?: string,
	): Promise<{ suggestions: AISuggestion[]; duration: number }> {
		const formData = new FormData();
		formData.append("file", file);
		if (language) formData.append("language", language);

		return this.requestFormDataWithKeepalive(
			"/api/analyze/suggestions",
			formData,
		);
	}

	async analyzeEmotions(
		file: File,
		windowSeconds?: number,
	): Promise<EmotionDetectionResult> {
		const formData = new FormData();
		formData.append("file", file);
		if (windowSeconds !== undefined)
			formData.append("window_seconds", windowSeconds.toString());

		return this.requestFormData<EmotionDetectionResult>(
			"/api/analyze/emotions",
			formData,
			300_000,
		);
	}

	async detectFaces(
		file: File,
		options?: { sampleInterval?: number; maxSamples?: number },
	): Promise<FaceDetectionResult> {
		const formData = new FormData();
		formData.append("file", file);
		if (options?.sampleInterval !== undefined)
			formData.append("sample_interval", options.sampleInterval.toString());
		if (options?.maxSamples !== undefined)
			formData.append("max_samples", options.maxSamples.toString());

		return this.requestFormData<FaceDetectionResult>(
			"/api/analyze/faces",
			formData,
			300_000, // 5 min timeout
		);
	}

	async analyzeSpeakers(
		file: File,
		options?: {
			numSpeakers?: number;
			minSpeakers?: number;
			maxSpeakers?: number;
		},
	): Promise<SpeakerDiarizationResult> {
		const formData = new FormData();
		formData.append("file", file);
		if (options?.numSpeakers !== undefined)
			formData.append("num_speakers", options.numSpeakers.toString());
		if (options?.minSpeakers !== undefined)
			formData.append("min_speakers", options.minSpeakers.toString());
		if (options?.maxSpeakers !== undefined)
			formData.append("max_speakers", options.maxSpeakers.toString());

		return this.requestFormData<SpeakerDiarizationResult>(
			"/api/analyze/speakers",
			formData,
			600_000, // 10 min timeout for diarization
		);
	}

	async findClips(
		segments: {
			id: number;
			text: string;
			start: number;
			end: number;
			words: { word: string; start: number; end: number; confidence: number }[];
		}[],
		options?: { minDuration?: number; maxDuration?: number; maxClips?: number },
	): Promise<FindClipsResult> {
		return this.requestWithKeepalive<FindClipsResult>(
			"/api/analyze/find-clips",
			{
				method: "POST",
				body: JSON.stringify({
					segments,
					min_duration: options?.minDuration ?? 15,
					max_duration: options?.maxDuration ?? 90,
					max_clips: options?.maxClips ?? 10,
				}),
			},
		);
	}

	async extractKeywords(
		segments: {
			id: number;
			text: string;
			start: number;
			end: number;
			words: { word: string; start: number; end: number; confidence: number }[];
		}[],
	): Promise<KeywordResult> {
		return this.requestWithKeepalive<KeywordResult>("/api/analyze/keywords", {
			method: "POST",
			body: JSON.stringify({ segments }),
		});
	}

	async generateQuestionCards(
		segments: {
			id: number;
			text: string;
			start: number;
			end: number;
			words: { word: string; start: number; end: number; confidence: number }[];
		}[],
		maxCards?: number,
	): Promise<QuestionCardsResult> {
		return this.requestWithKeepalive<QuestionCardsResult>(
			"/api/analyze/question-cards",
			{
				method: "POST",
				body: JSON.stringify({ segments, max_cards: maxCards ?? 5 }),
			},
		);
	}

	/** Suggest B-roll visuals for transcript segments. */
	async suggestBRoll(
		segments: {
			id: number;
			text: string;
			start: number;
			end: number;
			words: { word: string; start: number; end: number; confidence: number }[];
		}[],
	): Promise<BRollSuggestionsResult> {
		return this.requestWithKeepalive<BRollSuggestionsResult>(
			"/api/analyze/broll-suggestions",
			{
				method: "POST",
				body: JSON.stringify({ segments }),
			},
		);
	}

	async denoiseAudio(file: File, strength: number): Promise<DenoiseResult> {
		const formData = new FormData();
		formData.append("file", file);
		formData.append("strength", strength.toString());

		return this.requestFormData<DenoiseResult>("/api/audio/denoise", formData);
	}

	/** Fallback for videos the browser can't decode client-side (e.g. ProRes
	 * 4444 alpha .mov — no browser ships a ProRes decoder). Re-encodes to a
	 * WebM VP9 alpha stream the preview/export pipeline can actually play. */
	async transcodeAlphaVideo(file: File): Promise<Blob> {
		const url = `${this.baseUrl}/api/video/transcode-alpha`;
		const formData = new FormData();
		formData.append("file", file);

		const controller = new AbortController();
		// Re-encoding is slow (VP9), give it more room than the default.
		const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000);

		try {
			const response = await fetch(url, {
				method: "POST",
				body: formData,
				signal: controller.signal,
			});

			if (!response.ok) {
				const errorBody = await response.text().catch(() => "Unknown error");
				throw new AIClientError(
					`Alpha video transcode error (${response.status}): ${errorBody}`,
					response.status >= 500 ? "backend_error" : "network_error",
					response.status,
				);
			}

			return await response.blob();
		} catch (error) {
			if (error instanceof AIClientError) throw error;
			const classified = classifyError(error);
			throw new AIClientError(classified.message, classified.errorType);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	async exportRender(projectData: unknown): Promise<{ videoUrl: string }> {
		return this.request<{ videoUrl: string }>("/api/export/render", {
			method: "POST",
			body: JSON.stringify(projectData),
		});
	}
}
