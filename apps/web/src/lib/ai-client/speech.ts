import type { TranscriptionSegment, TTSRequest, TTSResult } from "@/types/ai";
import { ImageClient } from "./image";
import { AIClientError, classifyError, REQUEST_TIMEOUT_MS } from "./core";

/** Local text-to-speech, voice cloning and subtitles. */
export class SpeechClient extends ImageClient {
	async generateSpeech(request: TTSRequest): Promise<TTSResult> {
		return this.request<TTSResult>("/api/tts/generate", {
			method: "POST",
			body: JSON.stringify(request),
		});
	}

	async generateSpeechBlob(request: TTSRequest): Promise<Blob> {
		const url = `${this.baseUrl}/api/tts/generate`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		try {
			const response = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(request),
				signal: controller.signal,
			});

			if (!response.ok) {
				const errorBody = await response.text().catch(() => "Unknown error");
				throw new AIClientError(
					`TTS error (${response.status}): ${errorBody}`,
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

	async cloneVoice(
		file: File,
		name: string,
	): Promise<{ status: string; name: string; path: string }> {
		const formData = new FormData();
		formData.append("file", file);
		formData.append("name", name);

		return this.requestFormData<{ status: string; name: string; path: string }>(
			"/api/tts/clone-voice",
			formData,
		);
	}

	async generateSubtitles(
		segments: TranscriptionSegment[],
		format: string,
		maxCharsPerLine?: number,
	): Promise<{ content: string; format: string }> {
		return this.request<{ content: string; format: string }>(
			"/api/transcribe/subtitles",
			{
				method: "POST",
				body: JSON.stringify({
					segments,
					format,
					max_chars_per_line: maxCharsPerLine,
				}),
			},
		);
	}
}
