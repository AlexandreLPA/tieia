import { ProvidersClient } from "./providers";
import { HEALTH_TIMEOUT_MS } from "./core";
import type { MemoryStatus, ServicesStatus } from "./types";

/** Model selection, downloads and service preparation. */
export class SetupClient extends ProvidersClient {
	async llmStatus(): Promise<{
		available: boolean;
		default_model: string;
		active_backend: string;
		openrouter_configured: boolean;
		openrouter_model: string;
		models: {
			name: string;
			size: number;
			modified_at: string;
			details?: Record<string, unknown>;
		}[];
	}> {
		return this.request("/api/llm/status");
	}

	async setCloudModel(modelId: string): Promise<{
		status: string;
		previous_backend: string;
		current_backend: string;
		current_model: string;
	}> {
		return this.request("/api/llm/set-cloud-model", {
			method: "POST",
			body: JSON.stringify({ model: modelId }),
		});
	}

	async setLocalBackend(): Promise<{
		status: string;
		previous_backend: string;
		current_backend: string;
	}> {
		return this.request("/api/llm/set-local-backend", { method: "POST" });
	}

	async pullModel(
		modelName: string,
		onProgress?: (progress: number, status: string) => void,
	): Promise<void> {
		const url = `${this.baseUrl}/api/llm/pull-model`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model: modelName }),
		});

		if (!response.ok) {
			const errorBody = await response.text().catch(() => "Unknown error");
			throw new Error(`AI Backend error (${response.status}): ${errorBody}`);
		}

		if (!response.body) return;

		const reader = response.body.getReader();
		const decoder = new TextDecoder();

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const chunk = decoder.decode(value, { stream: true });
			const lines = chunk.split("\n").filter(Boolean);

			for (const line of lines) {
				try {
					const data = JSON.parse(line) as {
						status?: string;
						progress?: number;
						message?: string;
					};
					if (data.status === "error") {
						throw new Error(data.message ?? "Pull failed");
					}
					if (onProgress && data.progress !== undefined) {
						onProgress(data.progress, data.status ?? "downloading");
					}
				} catch (e) {
					if (e instanceof Error && e.message !== "Pull failed") continue;
					throw e;
				}
			}
		}
	}

	async setLLMModel(modelName: string): Promise<{
		status: string;
		previous_model: string;
		current_model: string;
	}> {
		return this.request("/api/llm/set-model", {
			method: "POST",
			body: JSON.stringify({ model: modelName }),
		});
	}

	async downloadModel(
		modelName: string,
		onProgress?: (progress: number) => void,
	): Promise<void> {
		const url = `${this.baseUrl}/api/setup/download-model`;

		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model: modelName }),
		});

		if (!response.ok) {
			const errorBody = await response.text().catch(() => "Unknown error");
			throw new Error(`AI Backend error (${response.status}): ${errorBody}`);
		}

		if (!response.body) {
			return;
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const chunk = decoder.decode(value, { stream: true });
			const lines = chunk.split("\n").filter(Boolean);

			for (const line of lines) {
				try {
					const data = JSON.parse(line) as { progress?: number };
					if (data.progress !== undefined && onProgress) {
						onProgress(data.progress);
					}
				} catch {
					// skip non-JSON lines
				}
			}
		}
	}

	async getMemoryStatus(): Promise<MemoryStatus> {
		return this.request<MemoryStatus>("/api/system/memory");
	}

	async getServicesStatus(): Promise<ServicesStatus> {
		return this.request<ServicesStatus>(
			"/api/services/status",
			{},
			HEALTH_TIMEOUT_MS,
		);
	}

	async pullOllamaModel(
		modelName: string,
		onProgress?: (progress: number, status: string) => void,
	): Promise<{ status: string; model: string }> {
		await this.pullModel(modelName, onProgress);
		return { status: "success", model: modelName };
	}

	async prepareWhisper(
		modelSize?: string,
	): Promise<{ status: string; message: string }> {
		return this.request<{ status: string; message: string }>(
			"/api/setup/download-model",
			{
				method: "POST",
				body: JSON.stringify({
					model_type: "whisper",
					model_name: modelSize ?? "",
				}),
			},
		);
	}

	async prepareTTS(): Promise<{ status: string; message: string }> {
		return this.request<{ status: string; message: string }>(
			"/api/setup/download-model",
			{
				method: "POST",
				body: JSON.stringify({ model_type: "tts", model_name: "" }),
			},
		);
	}

	async updateConfig(
		updates: Record<string, string | number>,
	): Promise<{ status: string; updates: Record<string, string> }> {
		return this.request("/api/config/update", {
			method: "POST",
			body: JSON.stringify({ updates }),
		});
	}

	async prepareDiffusion(): Promise<{ status: string; message: string }> {
		return this.request<{ status: string; message: string }>(
			"/api/setup/download-model",
			{
				method: "POST",
				body: JSON.stringify({ model_type: "diffusion", model_name: "" }),
			},
		);
	}
}
