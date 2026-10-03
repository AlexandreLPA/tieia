"use client";

import { useMemo } from "react";
import { usePreviewStore } from "@/stores/preview-store";
import { drawFeedOverlay } from "@/lib/tiktok-kit/graphics";

let feedGuideUrl: string | null = null;

/** Rendered once; the guide only ever shows in the preview, never in exports. */
function getFeedGuideUrl(): string {
	if (!feedGuideUrl) {
		feedGuideUrl = drawFeedOverlay({ width: 1080, height: 1920 }).toDataURL("image/png");
	}
	return feedGuideUrl;
}

function TikTokGuide() {
	const src = useMemo(() => getFeedGuideUrl(), []);
	return (
		<div className="pointer-events-none absolute inset-0 overflow-hidden">
			{/* Areas the app UI covers: keep captions, prices and arrows out of them */}
			<div className="absolute inset-x-0 top-0 h-[9%] bg-red-500/15" />
			<div className="absolute right-0 top-[40%] bottom-[8%] w-[17%] bg-red-500/15" />
			<div className="absolute inset-x-0 bottom-0 h-[22%] bg-red-500/15" />
			{/* biome-ignore lint/performance/noImgElement: data URL drawn on the client */}
			<img
				src={src}
				alt=""
				aria-hidden
				className="absolute inset-0 size-full object-fill opacity-90"
				draggable={false}
			/>
		</div>
	);
}

export function LayoutGuideOverlay() {
	const { layoutGuide } = usePreviewStore();

	if (layoutGuide.platform === null) return null;
	if (layoutGuide.platform === "tiktok") return <TikTokGuide />;

	return null;
}
