import type { CommandResult } from "@/types/ai";
import { SpeechClient } from "./speech";
import { AIClientError, classifyError, LLM_TIMEOUT_MS } from "./core";
import type { ChatTurn, VisionSupport } from "./types";

/** LLM chat, streaming, timeline commands, translation and fact-checking. */
export class LLMClient extends SpeechClient {
	async executeCommand(
		command: string,
		timelineState: unknown,
	): Promise<CommandResult> {
		return this.requestWithKeepalive<CommandResult>("/api/llm/command", {
			method: "POST",
			body: JSON.stringify({ command, timelineState }),
		});
	}

	async chat(message: string, system?: string): Promise<{ response: string }> {
		return this.request<{ response: string }>(
			"/api/llm/chat",
			{
				method: "POST",
				body: JSON.stringify({ message, system }),
			},
			LLM_TIMEOUT_MS,
		);
	}

	/**
	 * Streaming chat — tokens arrive via newline-delimited JSON.
	 * Calls `onToken` for each token as it arrives, preventing timeouts.
	 * Falls back to non-streaming /api/llm/chat if the stream endpoint is unavailable (404).
	 * Returns the full accumulated response when done.
	 */
	async chatStream(
		message: string,
		onToken: (token: string, accumulated: string) => void,
		system?: string,
	): Promise<{ response: string }> {
		const response = await this.openChatStream({ message, system });

		// If stream endpoint doesn't exist yet (backend not updated), fall back
		if (response.status === 404) {
			const fallback = await this.chat(message, system);
			onToken(fallback.response, fallback.response);
			return fallback;
		}

		return this.readChatStream(response, onToken);
	}

	/**
	 * Studio chat: sends the whole conversation, user turns may carry image
	 * parts. The backend refuses (error line) instead of answering text-only
	 * when the active model can't see images.
	 */
	async chatStreamMessages(
		messages: ChatTurn[],
		onToken: (token: string, accumulated: string) => void,
		system?: string,
	): Promise<{ response: string }> {
		const response = await this.openChatStream({ messages, system });
		return this.readChatStream(response, onToken);
	}

	/** Whether the active LLM accepts images (checked on the backend that would serve the chat). */
	async getVisionSupport(): Promise<VisionSupport> {
		return this.request<VisionSupport>("/api/llm/vision-support");
	}

	protected async openChatStream(
		body: Record<string, unknown>,
	): Promise<Response> {
		const url = `${this.baseUrl}/api/llm/chat/stream`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10_000);

		try {
			return await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				signal: controller.signal,
			});
		} catch (error) {
			if (error instanceof AIClientError) throw error;
			const classified = classifyError(error);
			throw new AIClientError(classified.message, classified.errorType);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	protected async readChatStream(
		response: Response,
		onToken: (token: string, accumulated: string) => void,
	): Promise<{ response: string }> {
		if (!response.ok) {
			const errorBody = await response.text().catch(() => "Unknown error");
			throw new AIClientError(
				`AI Backend error (${response.status}): ${errorBody}`,
				response.status >= 500 ? "backend_error" : "network_error",
				response.status,
			);
		}

		if (!response.body) {
			return { response: "" };
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let accumulated = "";

		// A line can be split across two chunks, so keep the partial tail buffered
		let buffer = "";
		const readLine = (line: string) => {
			if (!line.trim()) return;
			try {
				const data = JSON.parse(line) as {
					token?: string;
					done?: boolean;
					error?: string;
				};
				if (data.error) {
					throw new AIClientError(data.error, "backend_error");
				}
				if (data.token) {
					accumulated += data.token;
					onToken(data.token, accumulated);
				}
			} catch (e) {
				if (e instanceof AIClientError) throw e;
				// skip non-JSON lines
			}
		};

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) readLine(line);
			}
			readLine(buffer + decoder.decode());
		} finally {
			reader.releaseLock();
		}

		return { response: accumulated };
	}

	async translateText(text: string, targetLanguage: string): Promise<string> {
		const result = await this.chat(
			`Translate the following text to ${targetLanguage}. Return ONLY the translated text, nothing else. Do not add quotes, explanations, or notes.\n\n${text}`,
			`You are a professional translator. Translate accurately and naturally into ${targetLanguage}. Return only the translated text.`,
		);
		return result.response.trim();
	}

	/**
	 * Translate a single text via the local NLLB-200 translate-service.
	 * Fully offline (no API key, no cloud). `sourceIso`/`targetIso` are ISO
	 * 639-1 codes (e.g. "en", "es"); they are mapped to NLLB FLORES-200 codes
	 * by the backend. Use this for the privacy-first dubbing "local" engine
	 * instead of the slow LLM-based {@link translateText}.
	 */
	async nllbTranslate(
		text: string,
		targetIso: string,
		sourceIso?: string,
	): Promise<string> {
		const result = await this.request<{
			translated_text: string;
		}>("/api/translate/translate", {
			method: "POST",
			body: JSON.stringify({
				text,
				source_lang: sourceIso || "",
				target_lang: targetIso,
			}),
		});
		return result.translated_text;
	}

	/**
	 * Batch-translate many texts in one request via the local NLLB-200
	 * service. Order is preserved. Cheaper than N calls — ideal for dubbing
	 * a whole transcript before TTS.
	 */
	async nllbTranslateBatch(
		texts: string[],
		targetIso: string,
		sourceIso?: string,
	): Promise<string[]> {
		const result = await this.request<{
			translations: string[];
		}>("/api/translate/translate-batch", {
			method: "POST",
			body: JSON.stringify({
				texts,
				source_lang: sourceIso || "",
				target_lang: targetIso,
			}),
		});
		return result.translations;
	}

	/** Check whether the local NLLB translate-service is reachable. */
	async nllbTranslateStatus(): Promise<{
		available: boolean;
		reason?: string;
	}> {
		try {
			await this.request<{ status: string }>("/api/translate/health", {
				method: "GET",
			});
			return { available: true };
		} catch {
			return { available: false, reason: "translate-service not running" };
		}
	}

	async factCheck(text: string): Promise<{
		claims: {
			claim: string;
			verdict: string;
			confidence: string;
			explanation: string;
			source: string;
		}[];
		summary: string;
	}> {
		return this.requestWithKeepalive("/api/factcheck", {
			method: "POST",
			body: JSON.stringify({ text }),
		});
	}
}
