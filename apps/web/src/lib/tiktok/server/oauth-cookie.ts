import type { NextRequest, NextResponse } from "next/server";

/**
 * Short-lived cookie that carries the OAuth state, the PKCE verifier and the
 * exact redirect URI from /auth/login to /auth/callback.
 */

const COOKIE_NAME = "opencut_tiktok_oauth";
const COOKIE_PATH = "/api/tiktok/auth";
const MAX_AGE_SECONDS = 10 * 60;

export interface TikTokOAuthCookie {
	state: string;
	verifier: string;
	redirectUri: string;
}

export function setOAuthCookie({
	response,
	request,
	value,
}: {
	response: NextResponse;
	request: NextRequest;
	value: TikTokOAuthCookie;
}): void {
	response.cookies.set(COOKIE_NAME, JSON.stringify(value), {
		httpOnly: true,
		// Lax still sends it on TikTok's top-level redirect back to the callback.
		sameSite: "lax",
		secure: request.nextUrl.protocol === "https:",
		path: COOKIE_PATH,
		maxAge: MAX_AGE_SECONDS,
	});
}

export function readOAuthCookie(
	request: NextRequest,
): TikTokOAuthCookie | null {
	const raw = request.cookies.get(COOKIE_NAME)?.value;
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<TikTokOAuthCookie>;
		if (!parsed.state || !parsed.verifier || !parsed.redirectUri) return null;
		return {
			state: parsed.state,
			verifier: parsed.verifier,
			redirectUri: parsed.redirectUri,
		};
	} catch {
		return null;
	}
}

export function clearOAuthCookie(response: NextResponse): void {
	response.cookies.set(COOKIE_NAME, "", { path: COOKIE_PATH, maxAge: 0 });
}
