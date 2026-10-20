"use client";

import { useEffect, useState } from "react";
import {
	CONNECT_RESULT_MESSAGES,
	TIKTOK_CONNECT_CHANNEL,
	type TikTokConnectResult,
	parseConnectResult,
} from "@/lib/tiktok/connect-result";

/**
 * Where the TikTok login lands. It tells the editor tab (same origin) through
 * a BroadcastChannel, then tries to close itself; the opener link is gone by
 * now because tiktok.com isolates its pages, so no window.opener here.
 */
export default function TikTokConnectedPage({
	searchParams,
}: {
	searchParams: Promise<{ result?: string }>;
}) {
	const [result, setResult] = useState<TikTokConnectResult | null>(null);

	useEffect(() => {
		searchParams.then((params) => {
			const parsed = parseConnectResult(params.result);
			setResult(parsed);
			try {
				const channel = new BroadcastChannel(TIKTOK_CONNECT_CHANNEL);
				channel.postMessage({ result: parsed });
				channel.close();
			} catch {
				// Old browser: the editor also re-checks when its tab gets focus.
			}
			if (parsed === "ok") setTimeout(() => window.close(), 1500);
		});
	}, [searchParams]);

	return (
		<main className="bg-background flex min-h-screen items-center justify-center p-6">
			<div className="max-w-sm space-y-2 text-center">
				<h1 className="text-lg font-semibold">
					{result === "ok" ? "TikTok conectado" : "TikTok"}
				</h1>
				<p className="text-muted-foreground text-sm">
					{result ? CONNECT_RESULT_MESSAGES[result] : "Concluindo…"}
				</p>
			</div>
		</main>
	);
}
