import type { ChunkPlan } from "@/lib/tiktok/chunks";

/**
 * Uploads in progress, keyed by TikTok's publish_id. The upload_url stays on
 * the server; the browser only names the publish_id and the chunk index.
 * TikTok's upload_url is valid for one hour.
 */
export interface TikTokUploadSession {
	publishId: string;
	uploadUrl: string;
	plan: ChunkPlan;
	contentType: string;
	/** Chunks must arrive in order; this is the only index accepted next. */
	nextIndex: number;
	expiresAt: number;
}

const SESSION_TTL_MS = 60 * 60 * 1000;

// globalThis survives dev-server module reloads between route compilations.
const globalStore = globalThis as typeof globalThis & {
	__opencutTikTokUploads?: Map<string, TikTokUploadSession>;
};
globalStore.__opencutTikTokUploads ??= new Map();
const sessions = globalStore.__opencutTikTokUploads;

function pruneExpired(): void {
	const now = Date.now();
	for (const [publishId, session] of sessions) {
		if (session.expiresAt <= now) sessions.delete(publishId);
	}
}

export function createUploadSession(
	session: Omit<TikTokUploadSession, "nextIndex" | "expiresAt">,
): void {
	pruneExpired();
	sessions.set(session.publishId, {
		...session,
		nextIndex: 0,
		expiresAt: Date.now() + SESSION_TTL_MS,
	});
}

export function getUploadSession(
	publishId: string,
): TikTokUploadSession | null {
	pruneExpired();
	return sessions.get(publishId) ?? null;
}

export function deleteUploadSession(publishId: string): void {
	sessions.delete(publishId);
}
