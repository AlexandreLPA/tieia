import { SearchClient } from "./search";
import type {
	AutopilotPlan,
	AutopilotPlanRequest,
	AutopilotStockResult,
} from "./types";

/** Autopilot: topic -> researched script -> stock footage per scene. */
export class AutopilotClient extends SearchClient {
	async autopilotPlan(request: AutopilotPlanRequest): Promise<AutopilotPlan> {
		return this.requestWithKeepalive<AutopilotPlan>("/api/autopilot/plan", {
			method: "POST",
			body: JSON.stringify(request),
		});
	}

	async autopilotStock(
		query: string,
		orientation: "landscape" | "portrait" | "square",
	): Promise<AutopilotStockResult> {
		const params = new URLSearchParams({ query, orientation, limit: "5" });
		return this.request<AutopilotStockResult>(
			`/api/autopilot/stock?${params.toString()}`,
		);
	}

	/** Download an allow-listed stock file through the backend (avoids CORS). */
	async autopilotFetchMedia(url: string): Promise<Blob> {
		const response = await fetch(
			`${this.baseUrl}/api/autopilot/fetch?${new URLSearchParams({ url }).toString()}`,
		);
		if (!response.ok) {
			throw new Error(`Falha ao baixar o vídeo (${response.status})`);
		}
		return response.blob();
	}
}
