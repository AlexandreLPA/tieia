import { type NextRequest, NextResponse } from "next/server";
import { describeFailReason } from "@/lib/tiktok/messages";
import type {
	TikTokErrorResponse,
	TikTokPublishStatusResponse,
} from "@/lib/tiktok/types";
import { getFreshTikTokAccount } from "@/lib/tiktok/server/account";
import { fetchPublishStatus } from "@/lib/tiktok/server/api";
import { getTikTokCredentials } from "@/lib/tiktok/server/config";
import {
	rejectCrossSite,
	tikTokErrorResponse,
	tikTokNotConfigured,
} from "@/lib/tiktok/server/http";

/**
 * Step 3: POST /v2/post/publish/status/fetch/. TikTok allows 30 calls per
 * minute per token, so the client polls every few seconds at most.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const forbidden = rejectCrossSite(request);
	if (forbidden) return forbidden;
	const credentials = getTikTokCredentials();
	if (!credentials) return tikTokNotConfigured();

	const publishId = request.nextUrl.searchParams.get("publishId");
	if (!publishId) {
		return NextResponse.json<TikTokErrorResponse>(
			{ error: "Falta o publishId." },
			{ status: 400 },
		);
	}

	try {
		const account = await getFreshTikTokAccount(credentials);
		const { status, failReason } = await fetchPublishStatus({
			accessToken: account.accessToken,
			publishId,
		});
		return NextResponse.json<TikTokPublishStatusResponse>(
			{
				status,
				failReason,
				message:
					status === "FAILED" ? describeFailReason(failReason) : undefined,
			},
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (error) {
		return tikTokErrorResponse(error);
	}
}
