import { type NextRequest, NextResponse } from "next/server";
import type { TikTokAccountResponse } from "@/lib/tiktok/types";
import { revokeAccessToken } from "@/lib/tiktok/server/api";
import { getTikTokCredentials } from "@/lib/tiktok/server/config";
import {
	rejectCrossSite,
	tikTokNotConfigured,
} from "@/lib/tiktok/server/http";
import {
	deleteTikTokAccount,
	readTikTokAccount,
} from "@/lib/tiktok/server/token-store";

/**
 * Whether "Send to TikTok inbox" is available (keys set on the server) and
 * which account is connected. Never returns tokens.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
	const credentials = getTikTokCredentials();
	if (!credentials) {
		return NextResponse.json<TikTokAccountResponse>(
			{ configured: false, connected: false },
			{ headers: NO_STORE },
		);
	}
	const account = await readTikTokAccount({
		clientSecret: credentials.clientSecret,
	});
	if (!account || account.refreshTokenExpiresAt <= Date.now()) {
		return NextResponse.json<TikTokAccountResponse>(
			{ configured: true, connected: false },
			{ headers: NO_STORE },
		);
	}
	return NextResponse.json<TikTokAccountResponse>(
		{
			configured: true,
			connected: true,
			displayName: account.displayName,
			avatarUrl: account.avatarUrl,
		},
		{ headers: NO_STORE },
	);
}

/** Disconnect: revoke on TikTok (best effort) and delete the stored tokens. */
export async function DELETE(request: NextRequest) {
	const forbidden = rejectCrossSite(request);
	if (forbidden) return forbidden;
	const credentials = getTikTokCredentials();
	if (!credentials) return tikTokNotConfigured();

	const account = await readTikTokAccount({
		clientSecret: credentials.clientSecret,
	});
	if (account) {
		try {
			await revokeAccessToken({
				credentials,
				accessToken: account.accessToken,
			});
		} catch (error) {
			console.warn("TikTok token revoke failed:", error);
		}
	}
	await deleteTikTokAccount();
	return NextResponse.json<TikTokAccountResponse>(
		{ configured: true, connected: false },
		{ headers: NO_STORE },
	);
}
