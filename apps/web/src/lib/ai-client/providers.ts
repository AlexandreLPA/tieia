import type { TranscriptionResult } from "@/types/ai";
import { LLMClient } from "./llm";
import {
	AIClientError,
	classifyError,
	HEALTH_TIMEOUT_MS,
	REQUEST_TIMEOUT_MS,
} from "./core";

/** Third-party speech providers: Sarvam AI and Smallest AI. */
export class ProvidersClient extends LLMClient {
	async sarvamTranscribe(
		file: File,
		languageCode?: string,
		mode: string = "transcribe",
	): Promise<TranscriptionResult> {
		const formData = new FormData();
		formData.append("file", file);
		if (languageCode) {
			formData.append("language_code", languageCode);
		}
		formData.append("model", "saaras:v3");
		formData.append("mode", mode);

		// Pass the Sarvam key via header so the backend can use it
		const url = `${this.baseUrl}/api/sarvam/transcribe`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		try {
			const response = await fetch(url, {
				method: "POST",
				body: formData,
				signal: controller.signal,
				headers: this.sarvamHeaders(),
			});

			if (!response.ok) {
				const errorBody = await response.text().catch(() => "Unknown error");
				throw new AIClientError(
					`AI Backend error (${response.status}): ${errorBody}`,
					response.status >= 500 ? "backend_error" : "network_error",
					response.status,
				);
			}

			return response.json() as Promise<TranscriptionResult>;
		} catch (error) {
			if (error instanceof AIClientError) throw error;
			const classified = classifyError(error);
			throw new AIClientError(classified.message, classified.errorType);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	async sarvamTranslate(
		text: string,
		sourceLanguageCode: string,
		targetLanguageCode: string,
		model: string = "sarvam-translate:v1",
	): Promise<{ translated_text: string; source_language_code: string }> {
		return this.request<{
			translated_text: string;
			source_language_code: string;
		}>("/api/sarvam/translate", {
			method: "POST",
			headers: this.sarvamHeaders(),
			body: JSON.stringify({
				input: text,
				source_language_code: sourceLanguageCode,
				target_language_code: targetLanguageCode,
				model,
			}),
		});
	}

	async sarvamTTS(
		text: string,
		targetLanguageCode: string,
		speaker: string = "shubh",
		pace: number = 1.0,
	): Promise<Blob> {
		const url = `${this.baseUrl}/api/sarvam/tts`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		try {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...this.sarvamHeaders(),
				},
				body: JSON.stringify({
					text,
					target_language_code: targetLanguageCode,
					speaker,
					pace,
					model: "bulbul:v3",
				}),
				signal: controller.signal,
			});

			if (!response.ok) {
				const errorBody = await response.text().catch(() => "Unknown error");
				throw new AIClientError(
					`Sarvam TTS error (${response.status}): ${errorBody}`,
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

	async sarvamDetectLanguage(
		text: string,
	): Promise<{ language_code: string; script_code: string }> {
		return this.request<{ language_code: string; script_code: string }>(
			"/api/sarvam/detect-language",
			{
				method: "POST",
				headers: this.sarvamHeaders(),
				body: JSON.stringify({ input: text }),
			},
		);
	}

	async sarvamTransliterate(
		text: string,
		sourceLanguageCode: string,
		targetLanguageCode: string,
	): Promise<{ transliterated_text: string }> {
		return this.request<{ transliterated_text: string }>(
			"/api/sarvam/transliterate",
			{
				method: "POST",
				headers: this.sarvamHeaders(),
				body: JSON.stringify({
					input: text,
					source_language_code: sourceLanguageCode,
					target_language_code: targetLanguageCode,
				}),
			},
		);
	}

	async sarvamStatus(): Promise<{ available: boolean; reason?: string }> {
		return this.request<{ available: boolean; reason?: string }>(
			"/api/sarvam/status",
			{ headers: this.sarvamHeaders() },
			HEALTH_TIMEOUT_MS,
		);
	}

	async smallestTTS(
		text: string,
		voiceId: string = "emily",
		language: string = "auto",
		speed: number = 1.0,
		outputFormat: string = "mp3",
	): Promise<Blob> {
		const url = `${this.baseUrl}/api/smallest/tts`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		try {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...this.smallestHeaders(),
				},
				body: JSON.stringify({
					text,
					voice_id: voiceId,
					language,
					speed,
					output_format: outputFormat,
					sample_rate: 24000,
				}),
				signal: controller.signal,
			});

			if (!response.ok) {
				const errorBody = await response.text().catch(() => "Unknown error");
				throw new AIClientError(
					`Smallest TTS error (${response.status}): ${errorBody}`,
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

	async smallestTranscribe(
		file: File,
		language: string = "en",
	): Promise<TranscriptionResult> {
		const formData = new FormData();
		formData.append("file", file);
		formData.append("language", language);

		const url = `${this.baseUrl}/api/smallest/transcribe`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		try {
			const response = await fetch(url, {
				method: "POST",
				body: formData,
				signal: controller.signal,
				headers: this.smallestHeaders(),
			});

			if (!response.ok) {
				const errorBody = await response.text().catch(() => "Unknown error");
				throw new AIClientError(
					`Smallest STT error (${response.status}): ${errorBody}`,
					response.status >= 500 ? "backend_error" : "network_error",
					response.status,
				);
			}

			return response.json() as Promise<TranscriptionResult>;
		} catch (error) {
			if (error instanceof AIClientError) throw error;
			const classified = classifyError(error);
			throw new AIClientError(classified.message, classified.errorType);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	async smallestVoices(): Promise<{
		voices: { id: string; name: string; language: string; gender: string }[];
		languages: { code: string; name: string; status: string }[];
	}> {
		return this.request("/api/smallest/voices", {
			headers: this.smallestHeaders(),
		});
	}

	async smallestStatus(): Promise<{ available: boolean; reason?: string }> {
		return this.request<{ available: boolean; reason?: string }>(
			"/api/smallest/status",
			{ headers: this.smallestHeaders() },
			HEALTH_TIMEOUT_MS,
		);
	}
}
