import { type NextRequest, NextResponse } from "next/server";
import {
	buildAuthorizeUrl,
	createOAuthState,
	createPkcePair,
} from "@/lib/tiktok/server/api";
import {
	getTikTokCredentials,
	getTikTokRedirectUri,
} from "@/lib/tiktok/server/config";
import { tikTokNotConfigured } from "@/lib/tiktok/server/http";
import { setOAuthCookie } from "@/lib/tiktok/server/oauth-cookie";

/** Starts TikTok's Login Kit (desktop flow: loopback redirect + PKCE). */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const credentials = getTikTokCredentials();
	if (!credentials) return tikTokNotConfigured();

	const redirectUri = getTikTokRedirectUri(request);
	const state = createOAuthState();
	const { verifier, challenge } = createPkcePair();

	const response = NextResponse.redirect(
		buildAuthorizeUrl({
			clientKey: credentials.clientKey,
			redirectUri,
			state,
			codeChallenge: challenge,
		}),
	);
	setOAuthCookie({
		response,
		request,
		value: { state, verifier, redirectUri },
	});
	return response;
}
