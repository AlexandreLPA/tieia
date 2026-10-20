import { type NextRequest, NextResponse } from "next/server";
import { formatContentRange, getChunkRange } from "@/lib/tiktok/chunks";
import type {
	TikTokChunkResponse,
	TikTokErrorResponse,
} from "@/lib/tiktok/types";
import { putVideoChunk } from "@/lib/tiktok/server/api";
import { getTikTokCredentials } from "@/lib/tiktok/server/config";
import {
	rejectCrossSite,
	tikTokNotConfigured,
} from "@/lib/tiktok/server/http";
import {
	deleteUploadSession,
	getUploadSession,
} from "@/lib/tiktok/server/upload-sessions";

/**
 * Step 2: relay one chunk to TikTok's upload_url with its Content-Range.
 * PUT /api/tiktok/upload/chunk?publishId=…&index=N, body = the chunk bytes.
 * Chunks are accepted strictly in order; the same index may be retried.
 */

export const dynamic = "force-dynamic";

function fail(
	status: number,
	body: TikTokErrorResponse,
): NextResponse<TikTokErrorResponse> {
	return NextResponse.json(body, { status });
}

export async function PUT(request: NextRequest) {
	const forbidden = rejectCrossSite(request);
	if (forbidden) return forbidden;
	if (!getTikTokCredentials()) return tikTokNotConfigured();

	const publishId = request.nextUrl.searchParams.get("publishId") ?? "";
	const index = Number(request.nextUrl.searchParams.get("index"));
	const session = getUploadSession(publishId);
	if (!session) {
		return fail(404, { error: "Este envio expirou. Comece de novo." });
	}
	if (index !== session.nextIndex) {
		return fail(409, {
			error: `Parte fora de ordem: esperava ${session.nextIndex + 1}, chegou ${index + 1}.`,
		});
	}
	const range = getChunkRange({ plan: session.plan, index });
	if (!range) return fail(400, { error: "Parte inexistente." });

	const bytes = new Uint8Array(await request.arrayBuffer());
	if (bytes.byteLength !== range.size) {
		return fail(400, {
			error: `A parte ${index + 1} tem ${bytes.byteLength} bytes; esperava ${range.size}.`,
		});
	}

	let result: { status: number; detail: string };
	try {
		result = await putVideoChunk({
			uploadUrl: session.uploadUrl,
			bytes,
			contentRange: formatContentRange({
				range,
				videoSize: session.plan.videoSize,
			}),
			contentType: session.contentType,
		});
	} catch (error) {
		console.error("TikTok chunk upload failed:", error);
		return fail(502, {
			error: "A conexão com o TikTok caiu durante o envio.",
			retryable: true,
		});
	}

	if (result.status === 206 || result.status === 201) {
		session.nextIndex = index + 1;
		if (result.status === 201) deleteUploadSession(publishId);
		return NextResponse.json<TikTokChunkResponse>({
			complete: result.status === 201,
		});
	}
	if (result.status >= 500) {
		return fail(502, {
			error: `O TikTok falhou ao receber a parte ${index + 1}.`,
			retryable: true,
		});
	}
	deleteUploadSession(publishId);
	if (result.status === 403) {
		return fail(410, {
			error: "O link de envio do TikTok expirou (vale 1 hora). Comece de novo.",
		});
	}
	console.error("TikTok rejected chunk:", result.status, result.detail);
	return fail(502, {
		error: `O TikTok recusou a parte ${index + 1} (HTTP ${result.status}).`,
	});
}
