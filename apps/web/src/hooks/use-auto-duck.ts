import { useCallback } from "react";
import { useEditor } from "@/hooks/use-editor";
import { useTranscriptStore } from "@/stores/transcript-store";
import { toast } from "sonner";

interface AutoDuckOptions {
	duckAmountDb: number;
	fadeDurationSec: number;
	musicTrackId?: string;
}

const DEFAULT_OPTIONS: AutoDuckOptions = {
	duckAmountDb: -18,
	fadeDurationSec: 0.3,
};

export function useAutoDuck() {
	const editor = useEditor();
	const segments = useTranscriptStore((s) => s.segments);

	const applyAutoDuck = useCallback(
		(options: Partial<AutoDuckOptions> = {}) => {
			const opts = { ...DEFAULT_OPTIONS, ...options };
			const tracks = editor.timeline.getTracks();

			const speechSegments = segments.filter((s) => s.text.trim().length > 0);
			if (speechSegments.length === 0) {
				toast.error("Nenhum segmento de fala encontrado. Transcreva seu vídeo primeiro.");
				return;
			}

			const audioTracks = tracks.filter(
				(t) => t.type === "audio" || (t.type === "video" && t.elements.length > 0),
			);

			if (audioTracks.length === 0) {
				toast.error("Nenhuma faixa de áudio/vídeo encontrada para a redução automática de volume.");
				return;
			}

			const targetTrackId =
				opts.musicTrackId ??
				audioTracks.find((t) => {
					const name = t.name.toLowerCase();
					return name.includes("music") || name.includes("bgm") || name.includes("bg");
				})?.id ??
				audioTracks[audioTracks.length - 1].id;

			const targetTrack = tracks.find((t) => t.id === targetTrackId);
			if (!targetTrack) return;

			const musicElements = targetTrack.elements;
			if (musicElements.length === 0) return;

			const keyframes: Array<{
				trackId: string;
				elementId: string;
				propertyPath: "volume";
				time: number;
				value: number;
				interpolation: "linear";
			}> = [];

			const normalVolume = 1;
			const duckedVolume = Math.pow(10, opts.duckAmountDb / 20);

			for (const seg of speechSegments) {
				const segStart = seg.start;
				const segEnd = seg.end;
				const fadeDuration = opts.fadeDurationSec;

				for (const el of musicElements) {
					const elStart = el.startTime;
					const elEnd = el.startTime + el.duration;
					if (segEnd <= elStart || segStart >= elEnd) continue;

					const fadeInTime = Math.max(segStart - fadeDuration, elStart) - elStart;
					const duckTime = segStart - elStart;
					const recoverTime = segEnd - elStart;
					const fadeOutTime = Math.min(segEnd + fadeDuration, elEnd) - elStart;

					if (fadeInTime >= 0) {
						keyframes.push({
							trackId: targetTrackId,
							elementId: el.id,
							propertyPath: "volume",
							time: Math.max(0, fadeInTime),
							value: normalVolume,
							interpolation: "linear",
						});
					}

					keyframes.push({
						trackId: targetTrackId,
						elementId: el.id,
						propertyPath: "volume",
						time: Math.max(0, duckTime),
						value: duckedVolume,
						interpolation: "linear",
					});

					keyframes.push({
						trackId: targetTrackId,
						elementId: el.id,
						propertyPath: "volume",
						time: Math.max(0, recoverTime),
						value: duckedVolume,
						interpolation: "linear",
					});

					if (fadeOutTime <= el.duration) {
						keyframes.push({
							trackId: targetTrackId,
							elementId: el.id,
							propertyPath: "volume",
							time: fadeOutTime,
							value: normalVolume,
							interpolation: "linear",
						});
					}
				}
			}

			if (keyframes.length === 0) {
				toast.info("Nenhuma sobreposição de fala e música encontrada para a redução automática de volume.");
				return;
			}

			editor.timeline.upsertKeyframes({ keyframes });
			toast.success(
				`Redução automática aplicada: ${keyframes.length} keyframes de volume (redução de ${opts.duckAmountDb}dB)`,
			);
		},
		[editor, segments],
	);

	return { applyAutoDuck };
}
