import type {
	ChatterboxRequest,
	ChatterboxSavedVoice,
	ChatterboxTake,
	ReferenceAnalysis,
	TranscriptionSegment,
	TTSRequest,
	TTSResult,
} from "@/types/ai";
import { ImageClient } from "./image";
import { AIClientError, classifyError, REQUEST_TIMEOUT_MS } from "./core";

// The first Chatterbox take also loads the model, and downloads it (~3 GB) the first time.
const CHATTERBOX_TIMEOUT_MS = 900_000;

function numberHeader(headers: Headers, name: string): number | null {
	const value = headers.get(name);
	if (value === null || value === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

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

	/** One Chatterbox take: the WAV plus how close it came to the reference and its pace. */
	async generateChatterbox(request: ChatterboxRequest): Promise<ChatterboxTake> {
		const url = `${this.baseUrl}/api/chatterbox/generate`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), CHATTERBOX_TIMEOUT_MS);

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
					`Chatterbox error (${response.status}): ${errorBody}`,
					response.status >= 500 ? "backend_error" : "network_error",
					response.status,
				);
			}

			return {
				blob: await response.blob(),
				similarity: numberHeader(response.headers, "X-Voice-Similarity"),
				wordsPerMinute: numberHeader(response.headers, "X-Words-Per-Minute"),
				seed: numberHeader(response.headers, "X-Seed"),
				duration: numberHeader(response.headers, "X-Audio-Duration"),
			};
		} catch (error) {
			if (error instanceof AIClientError) throw error;
			const classified = classifyError(error);
			throw new AIClientError(classified.message, classified.errorType);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	async cloneChatterboxVoice(
		file: File,
		name: string,
	): Promise<{ status: string; name: string; path: string }> {
		const formData = new FormData();
		formData.append("file", file);
		formData.append("name", name);

		return this.requestFormData<{ status: string; name: string; path: string }>(
			"/api/chatterbox/clone-voice",
			formData,
		);
	}

	/** Encodes audio as MP3 with the backend's ffmpeg (browsers cannot write MP3). */
	async convertAudioToMp3(audio: Blob, bitrate: number): Promise<Blob> {
		const formData = new FormData();
		formData.append("file", audio, "audio.wav");
		formData.append("bitrate", String(bitrate));
		const response = await fetch(`${this.baseUrl}/api/audio/convert`, {
			method: "POST",
			body: formData,
		});
		if (!response.ok) {
			throw new AIClientError(
				`Não foi possível gerar o MP3 (${response.status}): ${await response.text().catch(() => "")}`,
				response.status >= 500 ? "backend_error" : "network_error",
				response.status,
			);
		}
		return response.blob();
	}

	/** The voices cloned so far, newest first. */
	async listChatterboxVoices(): Promise<ChatterboxSavedVoice[]> {
		const result = await this.request<{ voices: ChatterboxSavedVoice[] }>(
			"/api/chatterbox/voices",
		);
		return result.voices;
	}

	/** The recording a voice was cloned from, to listen to it again. */
	async getChatterboxVoiceAudio(name: string): Promise<Blob> {
		const response = await fetch(
			`${this.baseUrl}/api/chatterbox/voices/${encodeURIComponent(name)}/audio`,
		);
		if (!response.ok) {
			throw new AIClientError(
				`Chatterbox error (${response.status}): ${await response.text().catch(() => "")}`,
				response.status >= 500 ? "backend_error" : "network_error",
				response.status,
			);
		}
		return response.blob();
	}

	/** The voice with the chosen fixes applied, to listen to before deciding. Nothing is saved. */
	async previewImprovedVoice(name: string, fixes: string[]): Promise<Blob> {
		const response = await fetch(
			`${this.baseUrl}/api/chatterbox/voices/${encodeURIComponent(name)}/improve`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ fixes, save: false }),
			},
		);
		if (!response.ok) {
			throw new AIClientError(
				`Chatterbox error (${response.status}): ${await response.text().catch(() => "")}`,
				response.status >= 500 ? "backend_error" : "network_error",
				response.status,
			);
		}
		return response.blob();
	}

	/** Saves the fixes over the voice (the original is kept for "Desfazer"); returns the new analysis. */
	async saveImprovedVoice(name: string, fixes: string[]): Promise<ReferenceAnalysis> {
		const result = await this.request<{ analysis: ReferenceAnalysis }>(
			`/api/chatterbox/voices/${encodeURIComponent(name)}/improve`,
			{ method: "POST", body: JSON.stringify({ fixes, save: true }) },
		);
		return result.analysis;
	}

	async restoreChatterboxVoice(name: string): Promise<void> {
		await this.request(`/api/chatterbox/voices/${encodeURIComponent(name)}/restore`, {
			method: "POST",
		});
	}

	async deleteChatterboxVoice(name: string): Promise<void> {
		await this.request(`/api/chatterbox/voices/${encodeURIComponent(name)}`, {
			method: "DELETE",
		});
	}

	async analyzeChatterboxReference(speakerWav: string): Promise<ReferenceAnalysis> {
		return this.request<ReferenceAnalysis>("/api/chatterbox/analyze-reference", {
			method: "POST",
			body: JSON.stringify({ speakerWav }),
		});
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
