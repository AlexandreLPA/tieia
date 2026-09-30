"use client";

import { useCallback, useState } from "react";
import { useEditor } from "@/hooks/use-editor";
import {
	syncAngles,
	type SyncOffset,
	type SyncResult,
} from "@/lib/multicam/multicam-sync";
import { shiftTracksByOffset } from "@/lib/timeline-edits";
import { useBackgroundTasksStore } from "@/stores/background-tasks-store";
import { toast } from "sonner";

/**
 * Auto multicam sync via client-side audio cross-correlation.
 *
 * Computes per-angle offsets relative to a reference angle, shows them for
 * preview, then applies them by shifting each angle's video elements'
 * `startTime`. The apply step is wrapped in a transaction so one undo reverts
 * every angle at once.
 */
export function useMulticamSync() {
	const editor = useEditor();
	const [isSyncing, setIsSyncing] = useState(false);
	const [progressMsg, setProgressMsg] = useState<string | null>(null);
	const [previewOffsets, setPreviewOffsets] = useState<SyncOffset[] | null>(null);
	const [lastResult, setLastResult] = useState<SyncResult | null>(null);

	/** Compute offsets without applying. Populates `previewOffsets`. */
	const compute = useCallback(
		async (referenceTrackId?: string, searchWindowSec = 60) => {
			const tracks = editor.timeline.getTracks();
			const videoTracks = tracks.filter((t) => t.type === "video");
			if (videoTracks.length < 2) {
				toast.error("Adicione pelo menos 2 faixas de vídeo (ângulos) para sincronizar.");
				return null;
			}
			const refId = referenceTrackId ?? videoTracks[0].id;

			setIsSyncing(true);
			setProgressMsg("Starting…");
			setPreviewOffsets(null);

			const taskId = `multicam-sync-${Date.now()}`;
			useBackgroundTasksStore.getState().addTask({
				id: taskId,
				type: "proxy-generation",
				label: "Multicam sync",
				progress: "Analyzing audio…",
			});

			try {
				const result = await syncAngles(tracks, refId, editor, {
					searchWindowSec,
					onProgress: (msg) => {
						setProgressMsg(msg);
						useBackgroundTasksStore.getState().updateTask(taskId, { progress: msg });
					},
				});
				setPreviewOffsets(result.offsets);
				setLastResult(result);

				const skipped = result.offsets.filter((o) => o.skipped).length;
				const confident = result.offsets.filter((o) => !o.skipped && o.score >= 0.5).length;
				useBackgroundTasksStore.getState().updateTask(taskId, {
					status: "completed",
					progress: `${confident} confident${skipped ? `, ${skipped} skipped` : ""}`,
					completedAt: Date.now(),
				});
				toast.success(
					`Análise de sincronização concluída — ${confident} ângulo${confident === 1 ? "" : "s"} alinhado${confident === 1 ? "" : "s"}` +
						(skipped > 0 ? ` (${skipped} ignorado${skipped === 1 ? "" : "s"})` : "") +
						". Revise e aplique.",
				);
				return result;
			} catch (err) {
				const msg = err instanceof Error ? err.message : "Falha na sincronização";
				useBackgroundTasksStore.getState().updateTask(taskId, {
					status: "error",
					error: msg,
					completedAt: Date.now(),
				});
				toast.error("Falha na sincronização multicâmera", { description: msg });
				return null;
			} finally {
				setIsSyncing(false);
				setProgressMsg(null);
			}
		},
		[editor],
	);

	/** Apply the previously-computed preview offsets to the timeline. */
	const apply = useCallback(() => {
		if (!previewOffsets || previewOffsets.length === 0) {
			toast.error("Calcule os deslocamentos primeiro.");
			return;
		}
		const supportsTx = typeof editor.command.beginTransaction === "function";
		if (supportsTx) editor.command.beginTransaction();
		let applied = 0;
		for (const off of previewOffsets) {
			if (off.skipped || off.offsetSeconds === 0) continue;
			shiftTracksByOffset(editor, [off.trackId], off.offsetSeconds);
			applied += 1;
		}
		if (supportsTx) editor.command.commitTransaction();
		toast.success(
			applied > 0
				? `${applied} ângulo${applied === 1 ? "" : "s"} alinhado${applied === 1 ? "" : "s"} à referência.`
				: "Nenhum deslocamento para aplicar.",
		);
	}, [editor, previewOffsets]);

	const clearPreview = useCallback(() => {
		setPreviewOffsets(null);
		setLastResult(null);
	}, []);

	return {
		compute,
		apply,
		clearPreview,
		isSyncing,
		progressMsg,
		previewOffsets,
		lastResult,
	};
}
