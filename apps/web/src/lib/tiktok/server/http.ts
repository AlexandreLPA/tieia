import { type NextRequest, NextResponse } from "next/server";
import { describeTikTokError, needsReconnect } from "@/lib/tiktok/messages";
import type { TikTokErrorResponse } from "@/lib/tiktok/types";
import { TikTokApiError } from "./api";

/**
 * The upload and disconnect routes act on the connected account, so only the
 * editor's own pages may call them. Browsers send Sec-Fetch-Site on fetch().
 */
export function rejectCrossSite(
	request: NextRequest,
): NextResponse<TikTokErrorResponse> | null {
	const site = request.headers.get("sec-fetch-site");
	if (site && site !== "same-origin") {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	return null;
}

export function tikTokNotConfigured(): NextResponse<TikTokErrorResponse> {
	return NextResponse.json(
		{
			error:
				"Envio ao TikTok desligado: defina TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET.",
		},
		{ status: 404 },
	);
}

export function tikTokErrorResponse(
	error: unknown,
): NextResponse<TikTokErrorResponse> {
	if (error instanceof TikTokApiError) {
		const retryable =
			error.code === "rate_limit_exceeded" ||
			(error.httpStatus !== undefined && error.httpStatus >= 500);
		return NextResponse.json(
			{
				error: describeTikTokError({
					code: error.code,
					message: error.message,
				}),
				code: error.code,
				reconnect: needsReconnect(error.code),
				retryable,
			},
			{ status: error.httpStatus && error.httpStatus >= 400 ? error.httpStatus : 502 },
		);
	}
	console.error("TikTok route failed:", error);
	return NextResponse.json(
		{
			error: "Não foi possível falar com o TikTok. Verifique a conexão e tente de novo.",
			retryable: true,
		},
		{ status: 502 },
	);
}
