import type { NextRequest } from "next/server";

/** user.info.basic shows who is connected; video.upload sends to the inbox (no Direct Post). */
export const TIKTOK_SCOPES = ["user.info.basic", "video.upload"] as const;
export const TIKTOK_CALLBACK_PATH = "/api/tiktok/auth/callback";

export interface TikTokCredentials {
	clientKey: string;
	clientSecret: string;
}

/** Null when the feature is off: both keys must be set in the web server's env. */
export function getTikTokCredentials(): TikTokCredentials | null {
	const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
	const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
	if (!clientKey || !clientSecret) return null;
	return { clientKey, clientSecret };
}

/**
 * The redirect URI must match one registered on the TikTok app, character for
 * character. Default: the address the editor was opened at, so that
 * http://localhost:3100 and http://127.0.0.1:3100 each come back to the same
 * origin (the OAuth cookies are per host). TIKTOK_REDIRECT_URI overrides it.
 */
export function getTikTokRedirectUri(request: NextRequest): string {
	const configured = process.env.TIKTOK_REDIRECT_URI?.trim();
	if (configured) return configured;
	const host = request.headers.get("host") ?? request.nextUrl.host;
	const protocol =
		request.headers.get("x-forwarded-proto") ??
		request.nextUrl.protocol.replace(/:$/, "");
	return `${protocol}://${host}${TIKTOK_CALLBACK_PATH}`;
}
