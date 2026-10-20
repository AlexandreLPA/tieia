import { createHash, randomBytes } from "node:crypto";
import type { ChunkPlan } from "@/lib/tiktok/chunks";
import type { TikTokPublishStatus } from "@/lib/tiktok/types";
import { TIKTOK_SCOPES, type TikTokCredentials } from "./config";
import type { StoredTikTokAccount } from "./token-store";

/**
 * Calls to TikTok's Login Kit and Content Posting API (upload to inbox).
 * - Login Kit for Desktop (localhost redirect + PKCE):
 *   https://developers.tiktok.com/doc/login-kit-desktop
 * - Tokens: https://developers.tiktok.com/doc/oauth-user-access-token-management
 * - Upload: https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content
 */

const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const OPEN_API_URL = "https://open.tiktokapis.com";

export class TikTokApiError extends Error {
	constructor(
		message: string,
		readonly code?: string,
		readonly httpStatus?: number,
	) {
		super(message);
		this.name = "TikTokApiError";
	}
}

/** TikTok wants the challenge as the hex SHA-256 of the verifier, not base64url. */
export function createPkcePair(): { verifier: string; challenge: string } {
	// 48 bytes -> 64 base64url characters, all in PKCE's unreserved set.
	const verifier = randomBytes(48).toString("base64url");
	return { verifier, challenge: pkceChallenge(verifier) };
}

export function pkceChallenge(verifier: string): string {
	return createHash("sha256").update(verifier).digest("hex");
}

export function createOAuthState(): string {
	return randomBytes(24).toString("base64url");
}

export function buildAuthorizeUrl({
	clientKey,
	redirectUri,
	state,
	codeChallenge,
}: {
	clientKey: string;
	redirectUri: string;
	state: string;
	codeChallenge: string;
}): string {
	const params = new URLSearchParams({
		client_key: clientKey,
		response_type: "code",
		scope: TIKTOK_SCOPES.join(","),
		redirect_uri: redirectUri,
		state,
		code_challenge: codeChallenge,
		code_challenge_method: "S256",
	});
	return `${AUTHORIZE_URL}?${params.toString()}`;
}

interface TokenPayload {
	access_token?: string;
	expires_in?: number;
	open_id?: string;
	refresh_token?: string;
	refresh_expires_in?: number;
	scope?: string;
	error?: string;
	error_description?: string;
}

async function requestToken(
	body: Record<string, string>,
): Promise<Omit<StoredTikTokAccount, "displayName" | "avatarUrl">> {
	const response = await fetch(`${OPEN_API_URL}/v2/oauth/token/`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(body).toString(),
	});
	const payload = (await response.json().catch(() => ({}))) as TokenPayload;
	if (
		!response.ok ||
		payload.error ||
		!payload.access_token ||
		!payload.refresh_token ||
		!payload.open_id
	) {
		throw new TikTokApiError(
			payload.error_description || payload.error || "Token request failed",
			payload.error || "token_request_failed",
			response.status,
		);
	}
	const now = Date.now();
	return {
		openId: payload.open_id,
		accessToken: payload.access_token,
		refreshToken: payload.refresh_token,
		scope: payload.scope ?? "",
		accessTokenExpiresAt: now + (payload.expires_in ?? 0) * 1000,
		refreshTokenExpiresAt: now + (payload.refresh_expires_in ?? 0) * 1000,
	};
}

export function exchangeAuthorizationCode({
	credentials,
	code,
	redirectUri,
	codeVerifier,
}: {
	credentials: TikTokCredentials;
	code: string;
	redirectUri: string;
	codeVerifier: string;
}) {
	return requestToken({
		client_key: credentials.clientKey,
		client_secret: credentials.clientSecret,
		// URLSearchParams already decoded the code from the callback URL.
		code,
		grant_type: "authorization_code",
		redirect_uri: redirectUri,
		code_verifier: codeVerifier,
	});
}

export function refreshAccessToken({
	credentials,
	refreshToken,
}: {
	credentials: TikTokCredentials;
	refreshToken: string;
}) {
	return requestToken({
		client_key: credentials.clientKey,
		client_secret: credentials.clientSecret,
		grant_type: "refresh_token",
		refresh_token: refreshToken,
	});
}

export async function revokeAccessToken({
	credentials,
	accessToken,
}: {
	credentials: TikTokCredentials;
	accessToken: string;
}): Promise<void> {
	await fetch(`${OPEN_API_URL}/v2/oauth/revoke/`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_key: credentials.clientKey,
			client_secret: credentials.clientSecret,
			token: accessToken,
		}).toString(),
	});
}

interface OpenApiEnvelope<T> {
	data?: T;
	error?: { code?: string; message?: string; log_id?: string };
}

async function callOpenApi<T>({
	path,
	accessToken,
	method = "POST",
	body,
}: {
	path: string;
	accessToken: string;
	method?: "GET" | "POST";
	body?: unknown;
}): Promise<T> {
	const response = await fetch(`${OPEN_API_URL}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			...(body === undefined
				? {}
				: { "Content-Type": "application/json; charset=UTF-8" }),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const payload = (await response
		.json()
		.catch(() => ({}))) as OpenApiEnvelope<T>;
	const code = payload.error?.code;
	if (!response.ok || (code && code !== "ok") || !payload.data) {
		throw new TikTokApiError(
			payload.error?.message || `TikTok answered ${response.status}`,
			code && code !== "ok" ? code : undefined,
			response.status,
		);
	}
	return payload.data;
}

export async function fetchUserInfo({
	accessToken,
}: {
	accessToken: string;
}): Promise<{ displayName?: string; avatarUrl?: string }> {
	const data = await callOpenApi<{
		user?: { display_name?: string; avatar_url?: string };
	}>({
		path: "/v2/user/info/?fields=open_id,display_name,avatar_url",
		accessToken,
		method: "GET",
	});
	return {
		displayName: data.user?.display_name,
		avatarUrl: data.user?.avatar_url,
	};
}

/**
 * Starts an upload to the creator's inbox. The inbox endpoint takes only
 * source_info: title, privacy and the rest are chosen by the creator in the app.
 */
export async function initInboxVideoUpload({
	accessToken,
	plan,
}: {
	accessToken: string;
	plan: ChunkPlan;
}): Promise<{ publishId: string; uploadUrl: string }> {
	const data = await callOpenApi<{ publish_id?: string; upload_url?: string }>(
		{
			path: "/v2/post/publish/inbox/video/init/",
			accessToken,
			body: {
				source_info: {
					source: "FILE_UPLOAD",
					video_size: plan.videoSize,
					chunk_size: plan.chunkSize,
					total_chunk_count: plan.totalChunkCount,
				},
			},
		},
	);
	if (!data.publish_id || !data.upload_url) {
		throw new TikTokApiError("TikTok did not return an upload URL");
	}
	return { publishId: data.publish_id, uploadUrl: data.upload_url };
}

/** One PUT of the media transfer. 206 = more chunks expected, 201 = all received. */
export async function putVideoChunk({
	uploadUrl,
	bytes,
	contentRange,
	contentType,
}: {
	uploadUrl: string;
	bytes: Uint8Array;
	contentRange: string;
	contentType: string;
}): Promise<{ status: number; detail: string }> {
	const response = await fetch(uploadUrl, {
		method: "PUT",
		headers: {
			"Content-Type": contentType,
			"Content-Range": contentRange,
		},
		// fetch sets Content-Length from the byte array.
		body: bytes,
	});
	const detail = response.ok ? "" : (await response.text()).slice(0, 300);
	return { status: response.status, detail };
}

export async function fetchPublishStatus({
	accessToken,
	publishId,
}: {
	accessToken: string;
	publishId: string;
}): Promise<{ status: TikTokPublishStatus; failReason?: string }> {
	const data = await callOpenApi<{
		status?: TikTokPublishStatus;
		fail_reason?: string;
	}>({
		path: "/v2/post/publish/status/fetch/",
		accessToken,
		body: { publish_id: publishId },
	});
	if (!data.status) throw new TikTokApiError("TikTok returned no status");
	return { status: data.status, failReason: data.fail_reason || undefined };
}
