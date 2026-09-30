"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useAssetsPanelStore } from "@/stores/assets-panel-store";
import { useTranscriptStore } from "@/stores/transcript-store";

// Gives up waiting for the Legendas panel to pick the request up
const START_TIMEOUT_MS = 15_000;

/**
 * Start a transcription from anywhere in the editor: opens the Legendas panel
 * and asks it to run its normal flow, so engine/language choices stay in one place.
 * On success it returns to the tab the user was on (e.g. the AI chat).
 */
export function useStartTranscription() {
	const setActiveTab = useAssetsPanelStore((s) => s.setActiveTab);
	const requestTranscription = useTranscriptStore(
		(s) => s.requestTranscription,
	);

	return useCallback(() => {
		const previousTab = useAssetsPanelStore.getState().activeTab;
		requestTranscription();
		setActiveTab("captions");
		if (previousTab === "captions") return;

		let started = false;
		const unsubscribe = useTranscriptStore.subscribe((state) => {
			const { running, error } = state.captionsTranscription;
			if (running) {
				started = true;
				return;
			}
			if (!started) return;
			unsubscribe();
			if (!error && state.segments.length > 0) {
				useAssetsPanelStore.getState().setActiveTab(previousTab);
				toast.success("Transcrição pronta");
			}
		});
		setTimeout(() => {
			if (!started) unsubscribe();
		}, START_TIMEOUT_MS);
	}, [requestTranscription, setActiveTab]);
}
