import type {
	KVCacheConfig,
	ModelRecommendation,
	ModelTierSpec,
	TQDownloadProgress,
	TQLoadResult,
	TQModelsResponse,
	TurboQuantStatus,
} from "@/types/ai";
import { TemplatesClient } from "./templates";
import { AIClientError, HEALTH_TIMEOUT_MS } from "./core";

/** TurboQuant tiers, KV cache and model management. */
export class TurboQuantClient extends TemplatesClient {
	async turboquantStatus(): Promise<TurboQuantStatus> {
		return this.request<TurboQuantStatus>(
			"/api/turboquant/status",
			{},
			HEALTH_TIMEOUT_MS,
		);
	}

	async turboquantModelTiers(): Promise<{
		tiers: ModelTierSpec[];
		recommended_tier: string;
		recommended_model: string;
		current_model: string;
		hardware: TurboQuantStatus["hardware"];
	}> {
		return this.request("/api/turboquant/model-tiers");
	}

	async turboquantKVConfigurations(): Promise<{
		configurations: KVCacheConfig[];
		current_bits: number;
	}> {
		return this.request("/api/turboquant/kv-configurations");
	}

	async turboquantEstimate(
		modelTag?: string,
		contextLength?: number,
		kvBits?: number,
	): Promise<{
		model: string;
		model_tag: string;
		context_length: number;
		model_weight_mb: number;
		kv_cache: {
			baseline_kv_cache_mb: number;
			compressed_kv_cache_mb: number;
			savings_mb: number;
			compression_ratio: number;
			quality: string;
		};
		total_with_turboquant_mb: number;
		total_without_turboquant_mb: number;
		memory_saved_mb: number;
		memory_saved_percent: number;
	}> {
		return this.request("/api/turboquant/estimate", {
			method: "POST",
			body: JSON.stringify({
				model_tag: modelTag,
				context_length: contextLength ?? 8192,
				kv_bits: kvBits,
			}),
		});
	}

	async turboquantRecommend(
		budget: string = "auto",
		tier: string = "auto",
	): Promise<ModelRecommendation> {
		const params = new URLSearchParams({ budget, tier });
		return this.request<ModelRecommendation>(
			`/api/turboquant/recommend?${params.toString()}`,
		);
	}

	async turboquantApplyTier(tier: string): Promise<{
		tier: string;
		configuration: Record<string, string | number>;
		model: {
			name: string;
			tag: string;
			memory_mb: number;
			quality: string;
			description: string;
		};
	}> {
		const params = new URLSearchParams({ tier });
		return this.request(`/api/turboquant/apply-tier?${params.toString()}`, {
			method: "POST",
		});
	}

	async turboquantListModels(): Promise<TQModelsResponse> {
		return this.request<TQModelsResponse>("/api/turboquant/models");
	}

	async turboquantModelCatalog(): Promise<{
		catalog: TQModelsResponse["data"];
		device: string;
		gpu_available: boolean;
		memory: Record<string, number>;
	}> {
		return this.request("/api/turboquant/models/catalog");
	}

	async turboquantDownloadModel(
		modelId: string,
		onProgress?: (progress: TQDownloadProgress) => void,
	): Promise<void> {
		const url = `${this.baseUrl}/api/turboquant/models/download`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model_id: modelId }),
		});

		if (!response.ok) {
			const errorBody = await response.text().catch(() => "Unknown error");
			throw new AIClientError(
				`Download failed (${response.status}): ${errorBody}`,
				response.status >= 500 ? "backend_error" : "network_error",
				response.status,
			);
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
					const data = JSON.parse(line) as TQDownloadProgress;
					if (onProgress) onProgress(data);
				} catch {
					// skip non-JSON lines
				}
			}
		}
	}

	async turboquantLoadModel(modelId: string): Promise<TQLoadResult> {
		return this.request<TQLoadResult>(
			"/api/turboquant/models/load",
			{
				method: "POST",
				body: JSON.stringify({ model_id: modelId }),
			},
			300_000, // 5 min — model loading on CPU can be slow
		);
	}

	async turboquantUnloadModel(): Promise<{ status: string }> {
		return this.request("/api/turboquant/models/unload", {
			method: "POST",
		});
	}

	async turboquantDeleteModel(modelId: string): Promise<{ status: string }> {
		return this.request(
			`/api/turboquant/models/${encodeURIComponent(modelId)}`,
			{
				method: "DELETE",
			},
		);
	}
}
