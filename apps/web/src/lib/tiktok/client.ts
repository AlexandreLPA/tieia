import {
	type ChunkPlan,
	type ChunkSendResult,
	uploadChunksSequentially,
} from "./chunks";
import type {
	TikTokAccountResponse,
	TikTokChunkResponse,
	TikTokErrorResponse,
	TikTokPublishStatus,
	TikTokPublishStatusResponse,
	TikTokUploadInitResponse,
} from "./types";

/** Browser side of "send to TikTok inbox"; tokens never leave the server. */

export const TIKTOK_LOGIN_PATH = "/api/tiktok/auth/login";

export class TikTokSendError extends Error {
	constructor(
		message: string,
		readonly reconnect = false,
	) {
		super(message);
		this.name = "TikTokSendError";
	}
}

async function readError(response: Response): Promise<TikTokErrorResponse> {
	const body = (await response
		.json()
		.catch(() => null)) as TikTokErrorResponse | null;
	return body?.error ? body : { error: `Erro HTTP ${response.status}` };
}

async function throwFor(response: Response): Promise<never> {
	const body = await readError(response);
	throw new TikTokSendError(body.error, !!body.reconnect);
}

export async function fetchTikTokAccount(): Promise<TikTokAccountResponse> {
	try {
		const response = await fetch("/api/tiktok/account", { cache: "no-store" });
		if (!response.ok) return { configured: false, connected: false };
		return (await response.json()) as TikTokAccountResponse;
	} catch {
		return { configured: false, connected: false };
	}
}

export async function disconnectTikTok(): Promise<void> {
	const response = await fetch("/api/tiktok/account", { method: "DELETE" });
	if (!response.ok) await throwFor(response);
}

export type TikTokSendProgress =
	| {
			phase: "uploading";
			uploadedBytes: number;
			videoSize: number;
			chunkIndex: number;
			totalChunkCount: number;
	  }
	| { phase: "processing" };

export type TikTokSendOutcome =
	| Extract<TikTokPublishStatus, "SEND_TO_USER_INBOX" | "PUBLISH_COMPLETE">
	/** Upload finished but TikTok was still processing when we stopped asking. */
	| "STILL_PROCESSING";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(new TikTokSendError("Envio cancelado"));
			},
			{ once: true },
		);
	});
}

/**
 * Init → chunks in order → poll status until the video reaches the inbox.
 * Status polling stays under TikTok's 30 calls/minute per token.
 */
export async function sendVideoToTikTokInbox({
	video,
	onProgress,
	signal,
	pollIntervalMs = 3000,
	pollTimeoutMs = 2 * 60 * 1000,
}: {
	video: Blob;
	onProgress?: (progress: TikTokSendProgress) => void;
	signal?: AbortSignal;
	pollIntervalMs?: number;
	pollTimeoutMs?: number;
}): Promise<TikTokSendOutcome> {
	const initResponse = await fetch("/api/tiktok/upload", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			videoSize: video.size,
			contentType: video.type || "video/mp4",
		}),
		signal,
	});
	if (!initResponse.ok) await throwFor(initResponse);
	const init = (await initResponse.json()) as TikTokUploadInitResponse;

	const plan: ChunkPlan = {
		videoSize: video.size,
		chunkSize: init.chunkSize,
		totalChunkCount: init.totalChunkCount,
	};
	const publishId = encodeURIComponent(init.publishId);

	await uploadChunksSequentially({
		plan,
		signal,
		onProgress: (progress) => onProgress?.({ phase: "uploading", ...progress }),
		sendChunk: async (range): Promise<ChunkSendResult> => {
			const response = await fetch(
				`/api/tiktok/upload/chunk?publishId=${publishId}&index=${range.index}`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/octet-stream" },
					body: video.slice(range.start, range.end + 1),
					signal,
				},
			);
			if (response.ok) {
				const body = (await response.json()) as TikTokChunkResponse;
				return { kind: body.complete ? "complete" : "partial" };
			}
			const error = await readError(response);
			return error.retryable
				? { kind: "retry", message: error.error }
				: { kind: "error", message: error.error };
		},
	});

	onProgress?.({ phase: "processing" });
	const deadline = Date.now() + pollTimeoutMs;
	while (Date.now() < deadline) {
		await sleep(pollIntervalMs, signal);
		const response = await fetch(
			`/api/tiktok/upload/status?publishId=${publishId}`,
			{ cache: "no-store", signal },
		);
		if (!response.ok) {
			const error = await readError(response);
			if (error.retryable) continue;
			throw new TikTokSendError(error.error, !!error.reconnect);
		}
		const status = (await response.json()) as TikTokPublishStatusResponse;
		if (status.status === "FAILED") {
			throw new TikTokSendError(
				status.message ?? "O TikTok não conseguiu processar o vídeo.",
			);
		}
		if (
			status.status === "SEND_TO_USER_INBOX" ||
			status.status === "PUBLISH_COMPLETE"
		) {
			return status.status;
		}
	}
	return "STILL_PROCESSING";
}
