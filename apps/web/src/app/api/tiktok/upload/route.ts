import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertValidPlan, planChunks } from "@/lib/tiktok/chunks";
import type {
	TikTokErrorResponse,
	TikTokUploadInitResponse,
} from "@/lib/tiktok/types";
import { getFreshTikTokAccount } from "@/lib/tiktok/server/account";
import { initInboxVideoUpload } from "@/lib/tiktok/server/api";
import { getTikTokCredentials } from "@/lib/tiktok/server/config";
import {
	rejectCrossSite,
	tikTokErrorResponse,
	tikTokNotConfigured,
} from "@/lib/tiktok/server/http";
import { createUploadSession } from "@/lib/tiktok/server/upload-sessions";

/**
 * Step 1 of "send to TikTok inbox": plan the chunks and ask TikTok for an
 * upload URL (POST /v2/post/publish/inbox/video/init/, scope video.upload).
 */

export const dynamic = "force-dynamic";

const initSchema = z.object({
	videoSize: z.number().int().positive(),
	contentType: z.enum(["video/mp4", "video/webm", "video/quicktime"]),
});

export async function POST(request: NextRequest) {
	const forbidden = rejectCrossSite(request);
	if (forbidden) return forbidden;
	const credentials = getTikTokCredentials();
	if (!credentials) return tikTokNotConfigured();

	const parsed = initSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json<TikTokErrorResponse>(
			{ error: "Pedido de envio inválido." },
			{ status: 400 },
		);
	}

	let plan: ReturnType<typeof planChunks>;
	try {
		plan = planChunks({ videoSize: parsed.data.videoSize });
		assertValidPlan(plan);
	} catch {
		return NextResponse.json<TikTokErrorResponse>(
			{ error: "O vídeo é grande demais para enviar ao TikTok." },
			{ status: 400 },
		);
	}

	try {
		const account = await getFreshTikTokAccount(credentials);
		const { publishId, uploadUrl } = await initInboxVideoUpload({
			accessToken: account.accessToken,
			plan,
		});
		createUploadSession({
			publishId,
			uploadUrl,
			plan,
			contentType: parsed.data.contentType,
		});
		return NextResponse.json<TikTokUploadInitResponse>({
			publishId,
			chunkSize: plan.chunkSize,
			totalChunkCount: plan.totalChunkCount,
		});
	} catch (error) {
		return tikTokErrorResponse(error);
	}
}
