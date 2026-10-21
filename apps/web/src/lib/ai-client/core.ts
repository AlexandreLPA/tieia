import type { AIBackendStatus, AIErrorType } from "@/types/ai";

export const HEALTH_TIMEOUT_MS = 5_000;
export const REQUEST_TIMEOUT_MS = 120_000;
export const LLM_TIMEOUT_MS = 600_000; // 10 min — LLM generation can be slow on CPU

export class AIClientError extends Error {
	readonly errorType: AIErrorType;
	readonly statusCode?: number;

	constructor(message: string, errorType: AIErrorType, statusCode?: number) {
		super(message);
		this.name = "AIClientError";
		this.errorType = errorType;
		this.statusCode = statusCode;
	}
}

export function classifyError(error: unknown): {
	message: string;
	errorType: AIErrorType;
} {
	if (error instanceof AIClientError) {
		return { message: error.message, errorType: error.errorType };
	}

	if (error instanceof DOMException && error.name === "AbortError") {
		return {
			message:
				"Request timed out. The AI backend may be overloaded or starting up.",
			errorType: "timeout",
		};
	}

	if (error instanceof TypeError && error.message.includes("fetch")) {
		return {
			message: "Cannot connect to AI backend. Make sure it is running.",
			errorType: "connection_refused",
		};
	}

	const message =
		error instanceof Error ? error.message : "An unknown error occurred";

	if (
		message.includes("Failed to fetch") ||
		message.includes("NetworkError") ||
		message.includes("ERR_CONNECTION_REFUSED")
	) {
		return {
			message:
				"Cannot connect to AI backend. Make sure it is running on the correct port.",
			errorType: "connection_refused",
		};
	}

	if (message.includes("ECONNREFUSED") || message.includes("ENOTFOUND")) {
		return {
			message: "AI backend not found. Check that the server is started.",
			errorType: "connection_refused",
		};
	}

	return { message, errorType: "unknown" };
}

/** Read an API key from localStorage (set via the Settings panel). */
export function getStoredApiKey(key: string): string {
	if (typeof window === "undefined") return "";
	try {
		const stored = localStorage.getItem("opencut-api-keys");
		if (!stored) return "";
		const keys = JSON.parse(stored) as Record<string, string>;
		return keys[key]?.trim() || "";
	} catch {
		return "";
	}
}

/** Base URL, API key headers and the request helpers every area builds on. */
export class AIClientCore {
	protected baseUrl: string;

	constructor() {
		this.baseUrl =
			process.env.NEXT_PUBLIC_AI_BACKEND_URL || "http://localhost:8420";
	}

	getBaseUrl(): string {
		return this.baseUrl;
	}

	/**
	 * Get the Sarvam API key from localStorage.
	 *
	 * Audit finding H-3: NEXT_PUBLIC_* API keys were inlined into the browser
	 * bundle, letting any visitor scrape them from the deployed JS. Keys now
	 * come from the user's own localStorage entry only; server-side keys live
	 * in the backend env and are used by the backend without ever reaching the
	 * client.
	 */
	protected getSarvamApiKey(): string {
		return getStoredApiKey("sarvam");
	}

	/** Build extra headers that include the Sarvam API key for passthrough. */
	protected sarvamHeaders(): Record<string, string> {
		const key = this.getSarvamApiKey();
		if (!key) return {};
		return { "X-Sarvam-Api-Key": key };
	}

	/** Get the Smallest AI API key from localStorage only (audit finding H-3). */
	protected getSmallestApiKey(): string {
		return getStoredApiKey("smallest");
	}

	/** Build extra headers that include the Smallest AI API key for passthrough. */
	protected smallestHeaders(): Record<string, string> {
		const key = this.getSmallestApiKey();
		if (!key) return {};
		return { "X-Smallest-Api-Key": key };
	}

	/** Get the Seedance API key from localStorage only (audit finding H-3). */
	protected getSeedanceApiKey(): string {
		return getStoredApiKey("seedance");
	}

	/** Build extra headers that include the Seedance API key for passthrough. */
	protected seedanceHeaders(): Record<string, string> {
		const key = this.getSeedanceApiKey();
		if (!key) return {};
		return { "X-Seedance-Api-Key": key };
	}

	/** Get the Replicate API key from localStorage only (audit finding H-3). */
	protected getReplicateApiKey(): string {
		return getStoredApiKey("replicate");
	}

	protected replicateHeaders(): Record<string, string> {
		const key = this.getReplicateApiKey();
		if (!key) return {};
		return { "X-Replicate-Api-Token": key };
	}

	/** Get the Stability AI key from localStorage only (audit finding H-3). */
	protected getStabilityApiKey(): string {
		return getStoredApiKey("stability");
	}

	protected stabilityHeaders(): Record<string, string> {
		const key = this.getStabilityApiKey();
		if (!key) return {};
		return { "X-Stability-Api-Key": key };
	}

	/** Get the Luma AI key from localStorage only (audit finding H-3). */
	protected getLumaApiKey(): string {
		return getStoredApiKey("luma");
	}

	protected lumaHeaders(): Record<string, string> {
		const key = this.getLumaApiKey();
		if (!key) return {};
		return { "X-Luma-Api-Key": key };
	}

	protected videoHeaders(provider: string): Record<string, string> {
		switch (provider) {
			case "replicate":
				return this.replicateHeaders();
			case "stability":
				return this.stabilityHeaders();
			case "luma":
				return this.lumaHeaders();
			case "seedance":
				return this.seedanceHeaders();
			default:
				return {};
		}
	}

	protected async request<T>(
		endpoint: string,
		options: RequestInit = {},
		timeoutMs: number = REQUEST_TIMEOUT_MS,
	): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal,
				headers: {
					"Content-Type": "application/json",
					...options.headers,
				},
			});

			if (!response.ok) {
				const errorBody = await response.text().catch(() => "Unknown error");
				throw new AIClientError(
					`AI Backend error (${response.status}): ${errorBody}`,
					response.status >= 500 ? "backend_error" : "network_error",
					response.status,
				);
			}

			return response.json() as Promise<T>;
		} catch (error) {
			if (error instanceof AIClientError) throw error;
			const classified = classifyError(error);
			throw new AIClientError(classified.message, classified.errorType);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	protected async requestFormData<T>(
		endpoint: string,
		formData: FormData,
		timeoutMs: number = REQUEST_TIMEOUT_MS,
	): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(url, {
				method: "POST",
				body: formData,
				signal: controller.signal,
			});

			if (!response.ok) {
				const errorBody = await response.text().catch(() => "Unknown error");
				throw new AIClientError(
					`AI Backend error (${response.status}): ${errorBody}`,
					response.status >= 500 ? "backend_error" : "network_error",
					response.status,
				);
			}

			return response.json() as Promise<T>;
		} catch (error) {
			if (error instanceof AIClientError) throw error;
			const classified = classifyError(error);
			throw new AIClientError(classified.message, classified.errorType);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Make a request to a streaming NDJSON endpoint that sends keepalive pings.
	 * Ignores {"ping": true} lines and returns the {"result": ...} payload.
	 * Falls back to parsing plain JSON if the backend hasn't been updated yet.
	 */
	protected async requestWithKeepalive<T>(
		endpoint: string,
		options: RequestInit = {},
	): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

		let response: Response;
		try {
			response = await fetch(url, {
				...options,
				signal: controller.signal,
				headers: {
					"Content-Type": "application/json",
					...options.headers,
				},
			});
		} catch (error) {
			clearTimeout(timeoutId);
			if (error instanceof AIClientError) throw error;
			const classified = classifyError(error);
			throw new AIClientError(classified.message, classified.errorType);
		}
		clearTimeout(timeoutId);

		if (!response.ok) {
			const errorBody = await response.text().catch(() => "Unknown error");
			throw new AIClientError(
				`AI Backend error (${response.status}): ${errorBody}`,
				response.status >= 500 ? "backend_error" : "network_error",
				response.status,
			);
		}

		// Check content type — if it's regular JSON, the backend is old (no streaming)
		const contentType = response.headers.get("content-type") || "";
		if (contentType.includes("application/json")) {
			return response.json() as Promise<T>;
		}

		return this.readKeepaliveStream<T>(response);
	}

	/** Reads an NDJSON keepalive stream ({ping} lines, then {result} or {error}). */
	protected async readKeepaliveStream<T>(response: Response): Promise<T> {
		if (!response.body) {
			throw new AIClientError("Empty response body", "backend_error");
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();

		// A line can be split across two chunks, so keep the partial tail buffered
		let buffer = "";
		const readLine = (line: string): { result: T } | null => {
			if (!line.trim()) return null;
			try {
				const data = JSON.parse(line) as {
					ping?: boolean;
					result?: T;
					error?: string;
				};
				if (data.ping) return null;
				if (data.error) {
					throw new AIClientError(data.error, "backend_error");
				}
				if (data.result !== undefined) {
					return { result: data.result };
				}
			} catch (e) {
				if (e instanceof AIClientError) throw e;
			}
			return null;
		};

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					const hit = readLine(line);
					if (hit) return hit.result;
				}
			}

			buffer += decoder.decode();
			const last = readLine(buffer);
			if (last) return last.result;
		} finally {
			reader.releaseLock();
		}

		throw new AIClientError("Stream ended without result", "backend_error");
	}

	/**
	 * Like requestWithKeepalive but for FormData uploads.
	 * Falls back to plain JSON if the backend hasn't been updated.
	 */
	protected async requestFormDataWithKeepalive<T>(
		endpoint: string,
		formData: FormData,
	): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;

		const response = await fetch(url, {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			const errorBody = await response.text().catch(() => "Unknown error");
			throw new AIClientError(
				`AI Backend error (${response.status}): ${errorBody}`,
				response.status >= 500 ? "backend_error" : "network_error",
				response.status,
			);
		}

		// Fallback: if backend returns plain JSON, parse it directly
		const contentType = response.headers.get("content-type") || "";
		if (contentType.includes("application/json")) {
			return response.json() as Promise<T>;
		}

		return this.readKeepaliveStream<T>(response);
	}

	async health(): Promise<AIBackendStatus> {
		return this.request<AIBackendStatus>("/health", {}, HEALTH_TIMEOUT_MS);
	}
}
