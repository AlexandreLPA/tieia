import type { ReelTemplate } from "@/types/ai";
import { SetupClient } from "./setup";
import { AIClientError, classifyError, LLM_TIMEOUT_MS } from "./core";

/** Reel templates and template render jobs. */
export class TemplatesClient extends SetupClient {
	async generateReelTemplate(
		topic: string,
		duration: number = 15,
		style: string = "engaging",
	): Promise<ReelTemplate> {
		return this.requestWithKeepalive<ReelTemplate>("/api/template/generate", {
			method: "POST",
			body: JSON.stringify({ topic, duration, style }),
		});
	}

	/**
	 * Start a background template generation job.
	 * Returns {job_id, status: "running"} for polling.
	 * Falls back to direct generation if the backend doesn't support jobs.
	 */
	async startTemplateJob(
		topic: string,
		duration: number = 15,
		style: string = "engaging",
		language: string = "en",
	): Promise<{ job_id: string; status: string; result?: ReelTemplate }> {
		const url = `${this.baseUrl}/api/template/generate`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

		let response: Response;
		try {
			response = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ topic, duration, style, language }),
				signal: controller.signal,
			});
			clearTimeout(timeoutId);
		} catch (error) {
			clearTimeout(timeoutId);
			const classified = classifyError(error);
			throw new AIClientError(classified.message, classified.errorType);
		}

		if (!response.ok) {
			const errorBody = await response.text().catch(() => "Unknown error");
			throw new AIClientError(
				`AI Backend error (${response.status}): ${errorBody}`,
				response.status >= 500 ? "backend_error" : "network_error",
				response.status,
			);
		}

		const contentType = response.headers.get("content-type") || "";

		// New backend: returns JSON with job_id
		if (contentType.includes("application/json")) {
			const data = await response.json();
			if (data.job_id) return data;
			// Old backend returned full template as JSON — wrap it
			return {
				job_id: "__direct__",
				status: "completed",
				result: data as ReelTemplate,
			};
		}

		// Old backend with streaming (NDJSON) — read the stream and extract result
		if (response.body) {
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let lastResult: ReelTemplate | undefined;

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					const chunk = decoder.decode(value, { stream: true });
					for (const line of chunk.split("\n").filter(Boolean)) {
						try {
							const data = JSON.parse(line);
							if (data.result) lastResult = data.result as ReelTemplate;
							if (data.ping) continue;
						} catch {
							/* skip */
						}
					}
				}
			} finally {
				reader.releaseLock();
			}

			if (lastResult) {
				return {
					job_id: "__direct__",
					status: "completed",
					result: lastResult,
				};
			}
		}

		throw new AIClientError("Failed to generate template", "backend_error");
	}

	/** Poll a template job for its status and result. */
	async getTemplateJob(jobId: string): Promise<{
		job_id: string;
		status: "running" | "completed" | "failed";
		topic: string;
		duration: number;
		style: string;
		result?: ReelTemplate;
		error?: string;
	}> {
		return this.request(`/api/template/jobs/${jobId}`);
	}

	/** List all template jobs. */
	async listTemplateJobs(): Promise<{
		jobs: {
			job_id: string;
			status: string;
			topic: string;
			style: string;
			title?: string;
		}[];
	}> {
		return this.request("/api/template/jobs");
	}
}
