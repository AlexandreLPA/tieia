import { type NextRequest, NextResponse } from "next/server";
import type { TikTokConnectResult } from "@/lib/tiktok/connect-result";
import {
	exchangeAuthorizationCode,
	fetchUserInfo,
} from "@/lib/tiktok/server/api";
import { getTikTokCredentials } from "@/lib/tiktok/server/config";
import {
	clearOAuthCookie,
	readOAuthCookie,
} from "@/lib/tiktok/server/oauth-cookie";
import { writeTikTokAccount } from "@/lib/tiktok/server/token-store";

/** TikTok redirects here after the user approves (or denies) access. */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const params = request.nextUrl.searchParams;
	const saved = readOAuthCookie(request);

	const finish = (result: TikTokConnectResult) => {
		// Back to the same origin the flow started on (localhost vs 127.0.0.1).
		const target = new URL(
			"/tiktok/connected",
			saved?.redirectUri ?? request.nextUrl.origin,
		);
		target.searchParams.set("result", result);
		const response = NextResponse.redirect(target);
		clearOAuthCookie(response);
		return response;
	};

	const credentials = getTikTokCredentials();
	if (!credentials) return finish("not_configured");
	if (params.get("error")) {
		return finish(params.get("error") === "access_denied" ? "denied" : "error");
	}
	if (!saved) return finish("expired");
	const code = params.get("code");
	if (!code || params.get("state") !== saved.state) return finish("state");

	try {
		const token = await exchangeAuthorizationCode({
			credentials,
			code,
			redirectUri: saved.redirectUri,
			codeVerifier: saved.verifier,
		});
		if (!token.scope.split(",").includes("video.upload")) {
			return finish("scope");
		}
		const profile = await fetchUserInfo({
			accessToken: token.accessToken,
		}).catch(() => ({}));
		await writeTikTokAccount({
			account: { ...token, ...profile },
			clientSecret: credentials.clientSecret,
		});
		return finish("ok");
	} catch (error) {
		console.error("TikTok login failed:", error);
		return finish("error");
	}
}
