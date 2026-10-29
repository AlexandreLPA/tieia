"use client";

import { SubTabView } from "./sub-tab-view";
import { StickersView } from "./stickers";
import { OverlaysView } from "./overlays";
import { TikTokKitView } from "./tiktok-kit";

export function ElementsCombinedView() {
	return (
		<SubTabView
			tab="elements"
			tabs={[
				{ key: "tiktok-kit", label: "Kit TikTok Shop", content: <TikTokKitView /> },
				{ key: "stickers", label: "Figurinhas", content: <StickersView /> },
				{ key: "overlays", label: "Sobreposições", content: <OverlaysView /> },
			]}
		/>
	);
}
