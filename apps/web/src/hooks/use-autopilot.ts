import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useEditor } from "@/hooks/use-editor";
import { aiClient } from "@/lib/ai-client";
import type {
	AutopilotPlan,
	AutopilotScene,
	AutopilotStockVideo,
} from "@/lib/ai-client";
import { processMediaAssets } from "@/lib/media/processing";
import {
	buildImageElement,
	buildTextElement,
	buildVideoElement,
} from "@/lib/timeline/element-utils";
import {
	CANVAS_SIZES,
	ORIENTATIONS,
	coverScale,
	pickStock,
	stockQueries,
	type AutopilotAspect,
} from "@/lib/autopilot/helpers";

export type { AutopilotAspect };

export interface AutopilotConfig {
	topic: string;
	duration: number;
	language: string;
	aspectRatio: AutopilotAspect;
}

export type AutopilotStage = "idle" | "planning" | "building" | "done" | "error";

export interface AutopilotState {
	stage: AutopilotStage;
	message: string;
	sceneIndex: number;
	sceneTotal: number;
	plan: AutopilotPlan | null;
	narrated: boolean;
	error: string | null;
}

const IDLE_STATE: AutopilotState = {
	stage: "idle",
	message: "",
	sceneIndex: 0,
	sceneTotal: 0,
	plan: null,
	narrated: false,
	error: null,
};

async function decodeDuration(blob: Blob): Promise<number> {
	const context = new AudioContext();
	try {
		const buffer = await context.decodeAudioData(await blob.arrayBuffer());
		return buffer.duration;
	} finally {
		void context.close();
	}
}

/** Finds footage for one scene and fills `sceneDuration` seconds, looping the clip if it is short. */
async function insertFootage({
	editor,
	scene,
	orientation,
	startTime,
	sceneDuration,
	projectId,
	canvas,
}: {
	editor: ReturnType<typeof useEditor>;
	canvas: { width: number; height: number };
	scene: AutopilotScene;
	orientation: "landscape" | "portrait" | "square";
	startTime: number;
	sceneDuration: number;
	projectId: string;
}): Promise<void> {
	let results: AutopilotStockVideo[] = [];
	for (const query of stockQueries(scene.search_query)) {
		results = (await aiClient.autopilotStock(query, orientation)).results;
		if (results.length > 0) break;
	}
	const pick = pickStock(results, sceneDuration);
	if (!pick) {
		toast.warning(`Sem midia para "${scene.search_query}"`);
		return;
	}

	const blob = await aiClient.autopilotFetchMedia(pick.url);
	const isImage = pick.kind === "image";
	const file = new File([blob], isImage ? `stock-${pick.id}.jpg` : `pexels-${pick.id}.mp4`, {
		type: blob.type || (isImage ? "image/jpeg" : "video/mp4"),
	});
	const [processed] = await processMediaAssets({ files: [file] });
	if (!processed) return;
	const label = `${isImage ? "Commons" : "Pexels"} - ${pick.credit || pick.id}`;
	const mediaId = await editor.media.addMediaAsset({
		projectId,
		asset: { ...processed, name: label },
	});

	if (isImage) {
		editor.timeline.insertElement({
			element: {
				...buildImageElement({ mediaId, name: label, duration: sceneDuration, startTime }),
				transform: { scale: coverScale(processed, canvas), position: { x: 0, y: 0 }, rotate: 0 },
			},
			placement: { mode: "auto", trackType: "video" },
		});
		return;
	}

	const clipDuration = processed.duration ?? pick.duration;
	let placed = 0;
	while (placed < sceneDuration - 0.05) {
		const length = Math.min(clipDuration, sceneDuration - placed);
		editor.timeline.insertElement({
			element: {
				...buildVideoElement({
					mediaId,
					name: label,
					duration: length,
					startTime: startTime + placed,
				}),
				sourceDuration: clipDuration,
				muted: true,
			},
			placement: { mode: "auto", trackType: "video" },
		});
		placed += length;
	}
}

/** Topic -> LLM research + script -> Pexels footage -> populated timeline. */
export function useAutopilot() {
	const editor = useEditor();
	const [state, setState] = useState<AutopilotState>(IDLE_STATE);
	const runningRef = useRef(false);

	const patch = useCallback((update: Partial<AutopilotState>) => {
		setState((prev) => ({ ...prev, ...update }));
	}, []);

	const run = useCallback(
		async (config: AutopilotConfig) => {
			if (runningRef.current) return;
			runningRef.current = true;
			setState({ ...IDLE_STATE, stage: "planning", message: "Pesquisando e escrevendo o roteiro..." });

			try {
				const plan = await aiClient.autopilotPlan({
					topic: config.topic,
					duration: config.duration,
					language: config.language,
				});
				patch({
					stage: "building",
					plan,
					sceneTotal: plan.scenes.length,
					message: "Montando a timeline...",
				});

				const canvas = CANVAS_SIZES[config.aspectRatio];
				const orientation = ORIENTATIONS[config.aspectRatio];
				const projectId = editor.project.getActive().metadata.id;
				const captionTrackId = editor.timeline.addTrack({ type: "text", index: 0 });
				editor.timeline.renameTrack({ trackId: captionTrackId, name: "Autopilot: legendas" });
				const titleTrackId = editor.timeline.addTrack({ type: "text", index: 0 });
				editor.timeline.renameTrack({ trackId: titleTrackId, name: "Autopilot: titulos" });

				let audioTrackId: string | null = null;
				let ttsAvailable = true;
				let narrated = false;
				let cursor = 0;

				for (let i = 0; i < plan.scenes.length; i++) {
					const scene: AutopilotScene = plan.scenes[i];
					patch({ sceneIndex: i + 1, message: `Cena ${i + 1}/${plan.scenes.length}: ${scene.search_query}` });

					let sceneDuration = scene.duration;

					// Narration (optional: needs the TTS service)
					let audioBlob: Blob | null = null;
					if (ttsAvailable) {
						try {
							audioBlob = await aiClient.generateSpeechBlob({
								text: scene.narration,
								language: config.language,
							});
							sceneDuration = Math.max(sceneDuration, await decodeDuration(audioBlob));
						} catch {
							ttsAvailable = false;
							audioBlob = null;
						}
					}

					await insertFootage({
						editor,
						scene,
						orientation,
						startTime: cursor,
						sceneDuration,
						projectId,
						canvas,
					});

					if (audioBlob) {
						const file = new File([audioBlob], `narration-${i + 1}.${audioBlob.type.includes("mpeg") ? "mp3" : "wav"}`, { type: audioBlob.type || "audio/wav" });
						const [processed] = await processMediaAssets({ files: [file] });
						if (processed) {
							const mediaId = await editor.media.addMediaAsset({ projectId, asset: processed });
							audioTrackId ??= editor.timeline.addTrack({ type: "audio" });
							editor.timeline.insertElement({
								element: {
									type: "audio",
									sourceType: "upload",
									mediaId,
									name: `Narracao ${i + 1}`,
									startTime: cursor,
									duration: processed.duration ?? sceneDuration,
									trimStart: 0,
									trimEnd: 0,
									sourceDuration: processed.duration ?? sceneDuration,
									volume: 1,
									muted: false,
								},
								placement: { mode: "explicit", trackId: audioTrackId },
							});
							narrated = true;
						}
					}

					if (scene.on_screen_text) {
						editor.timeline.insertElement({
							element: buildTextElement({
								startTime: cursor,
								raw: {
									name: `Titulo ${i + 1}`,
									content: scene.on_screen_text,
									duration: Math.min(sceneDuration, 4),
									fontSize: 7,
									fontWeight: "bold",
									background: { enabled: false, color: "#000000" },
									stroke: { enabled: true, color: "#000000", width: 6 },
									shadow: { enabled: true, color: "#000000", blur: 10, offsetX: 0, offsetY: 3 },
									transform: { scale: 1, position: { x: 0, y: canvas.height * -0.38 }, rotate: 0 },
								},
							}),
							placement: { mode: "explicit", trackId: titleTrackId },
						});
					}

					editor.timeline.insertElement({
						element: buildTextElement({
							startTime: cursor,
							raw: {
								name: `Legenda ${i + 1}`,
								content: scene.narration,
								duration: sceneDuration,
								fontSize: 4.5,
								background: { enabled: false, color: "#000000" },
									stroke: { enabled: true, color: "#000000", width: 6 },
									shadow: { enabled: true, color: "#000000", blur: 10, offsetX: 0, offsetY: 3 },
								transform: { scale: 1, position: { x: 0, y: canvas.height * 0.38 }, rotate: 0 },
							},
						}),
						placement: { mode: "explicit", trackId: captionTrackId },
					});

					cursor += sceneDuration;
				}

				editor.project.updateSettings({ settings: { canvasSize: canvas }, pushHistory: false });
				patch({ stage: "done", narrated, message: `Video montado: ${Math.round(cursor)}s, ${plan.scenes.length} cenas` });
				toast.success(`"${plan.title}" montado na timeline`, {
					description: narrated ? "Narracao com voz sintetizada (IA)." : "Sem narracao: nenhum servico de voz respondeu.",
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : "Falha no piloto automatico";
				patch({ stage: "error", error: message, message });
				toast.error("Piloto automatico falhou", { description: message });
			} finally {
				runningRef.current = false;
			}
		},
		[editor, patch],
	);

	const reset = useCallback(() => setState(IDLE_STATE), []);

	return { state, run, reset };
}
