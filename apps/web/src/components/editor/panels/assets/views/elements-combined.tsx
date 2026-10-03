"use client";

import { SubTabView } from "./sub-tab-view";
import { StickersView } from "./stickers";
import { OverlaysView } from "./overlays";
import { TikTokKitView } from "./tiktok-kit";
import { KlipyView } from "./klipy";

export function ElementsCombinedView() {
	return (
		<SubTabView
			tabs={[
				{ key: "tiktok-kit", label: "Kit TikTok Shop", content: <TikTokKitView /> },
				{ key: "klipy", label: "GIFs KLIPY", content: <KlipyView /> },
				{ key: "stickers", label: "Figurinhas", content: <StickersView /> },
				{ key: "overlays", label: "Sobreposições", content: <OverlaysView /> },
			]}
		/>
	);
}
