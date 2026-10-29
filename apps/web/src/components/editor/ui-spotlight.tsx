"use client";

import { useEffect } from "react";
import { useAssetsPanelStore } from "@/stores/assets-panel-store";

/** How long to wait for the control to render (a panel may be opening) */
const FIND_TIMEOUT_MS = 3000;
const PULSES = 3;

/**
 * Points at the control the app asked to show (useAssetsPanelStore.showUiTarget):
 * scrolls it into view and pulses a ring around it. Renders nothing.
 */
export function UiSpotlight() {
	const uiTarget = useAssetsPanelStore((s) => s.uiTarget);

	useEffect(() => {
		if (!uiTarget) return;
		let cancelled = false;
		let animation: Animation | null = null;
		const started = performance.now();

		const find = () => {
			if (cancelled) return;
			const element = document.querySelector<HTMLElement>(
				`[data-ui-target="${CSS.escape(uiTarget.id)}"]`,
			);
			if (!element || element.getClientRects().length === 0) {
				if (performance.now() - started < FIND_TIMEOUT_MS) requestAnimationFrame(find);
				return;
			}
			element.scrollIntoView({ block: "center", behavior: "smooth" });
			animation = element.animate(
				[
					{ boxShadow: "0 0 0 0 rgba(56, 189, 248, 0)" },
					{ boxShadow: "0 0 0 4px rgba(56, 189, 248, 0.9)" },
					{ boxShadow: "0 0 0 0 rgba(56, 189, 248, 0)" },
				],
				{ duration: 900, iterations: PULSES, easing: "ease-in-out" },
			);
		};
		find();

		return () => {
			cancelled = true;
			animation?.cancel();
		};
	}, [uiTarget]);

	return null;
}
