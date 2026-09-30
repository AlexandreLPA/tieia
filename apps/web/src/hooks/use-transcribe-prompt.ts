"use client";

import { useEffect, useRef } from "react";
import { useEditor } from "@/hooks/use-editor";
import { useTranscriptStore } from "@/stores/transcript-store";
import { useAIStatus } from "@/hooks/use-ai-status";
import { toast } from "sonner";

const DISMISSED_KEY_PREFIX = "opencut-transcribe-prompt-dismissed:";

function wasAlreadyShown(projectId: string): boolean {
	try {
		return localStorage.getItem(DISMISSED_KEY_PREFIX + projectId) === "1";
	} catch {
		return false;
	}
}

function markAsShown(projectId: string): void {
	try {
		localStorage.setItem(DISMISSED_KEY_PREFIX + projectId, "1");
	} catch {
		// Storage unavailable — worst case the prompt can reappear.
	}
}

/**
 * Watches for video/audio elements on the timeline and prompts
 * the user to transcribe if they haven't already.
 *
 * Shows the prompt once per project — persisted in localStorage so it
 * doesn't reappear on every page refresh.
 */
export function useTranscribePrompt() {
	const editor = useEditor();
	const { isConnected } = useAIStatus();
	const hasPrompted = useRef(false);
	const segments = useTranscriptStore((s) => s.segments);
	const isTranscribing = useTranscriptStore((s) => s.isTranscribing);

	useEffect(() => {
		if (hasPrompted.current) return;
		if (segments.length > 0 || isTranscribing) return;
		if (!isConnected) return;

		const projectId = editor.project.getActive().metadata.id;
		if (wasAlreadyShown(projectId)) return;

		const tracks = editor.timeline.getTracks();
		const hasMedia = tracks.some(
			(track) =>
				(track.type === "video" || track.type === "audio") &&
				track.elements.length > 0,
		);

		if (hasMedia) {
			hasPrompted.current = true;
			markAsShown(projectId);
			toast("Vídeo detectado — quer transcrevê-lo?", {
				description:
					"Transcreva seu vídeo para editá-lo como um documento de texto. Exclua frases, remova vícios de linguagem e reordene seções.",
				duration: 10000,
				closeButton: true,
				action: {
					label: "Transcrever",
					onClick: () => {
						// Trigger via the AI toolbar — user clicks the mic button
						toast.info(
							"Clique no botão de microfone na barra de ferramentas para iniciar a transcrição.",
						);
					},
				},
			});
		}
	}, [editor, isConnected, segments.length, isTranscribing]);
}
