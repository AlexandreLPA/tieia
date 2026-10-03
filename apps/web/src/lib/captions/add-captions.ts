import type { EditorCore } from "@/core";
import { DEFAULT_TEXT_ELEMENT } from "@/constants/text-constants";
import {
	type CaptionSegment,
	chunkCaptionSegments,
	getCaptionStyle,
} from "./caption-styles";
import { getTranscriptSourceClips, mapSegmentsToTimeline } from "./timeline-mapping";
import { useCaptionStyleStore } from "@/stores/caption-style-store";

export const CAPTION_TRACK_PREFIX = "Legendas:";

// Offset from the canvas center as a share of its height. 0.18 sits at 68%,
// just above the area the TikTok description and buttons cover (bottom ~22%)
export const CAPTION_Y_OFFSET = 0.18;

/**
 * Adds a caption track from transcript segments with the user's chosen
 * style: short chunks, spoken-word highlight, timed to the edited timeline.
 * Shared by the Legendas panel and every "Adicionar legendas" shortcut.
 */
export function addCaptionTrack({
	editor,
	segments,
	languageLabel,
	yOffset = CAPTION_Y_OFFSET,
}: {
	editor: EditorCore;
	segments: CaptionSegment[];
	languageLabel: string;
	yOffset?: number;
}): string {
	const { styleId, wordsPerCaption, uppercase } = useCaptionStyleStore.getState();
	const style = getCaptionStyle(styleId).config;

	const trackId = editor.timeline.addTrack({ type: "text", index: 0 });
	editor.timeline.renameTrack({
		trackId,
		name: `${CAPTION_TRACK_PREFIX} ${languageLabel}`,
	});
	const canvasSize = editor.project.getActive().settings.canvasSize;
	const subtitleY = canvasSize.height * yOffset;

	// The transcript is timed against the source file, not the edit
	const captions = chunkCaptionSegments({
		segments: mapSegmentsToTimeline({
			segments,
			clips: getTranscriptSourceClips(editor.timeline.getTracks()),
		}),
		maxWords: wordsPerCaption,
		uppercase,
	});

	for (let i = 0; i < captions.length; i++) {
		const caption = captions[i];

		// Word timings are relative to the caption's own start
		const wordTimings = caption.words?.map((w) => ({
			word: w.word,
			start: w.start - caption.start,
			end: w.end - caption.start,
		}));

		editor.timeline.insertElement({
			placement: { mode: "explicit", trackId },
			element: {
				...DEFAULT_TEXT_ELEMENT,
				name: `${languageLabel} ${i + 1}`,
				content: caption.text,
				duration: caption.end - caption.start,
				startTime: caption.start,
				fontSize: wordsPerCaption > 0 && wordsPerCaption <= 3 ? 5 : 4,
				...style,
				...(wordTimings && wordTimings.length > 0 ? { wordTimings } : {}),
				textAlign: "center",
				transform: {
					scale: 1,
					position: { x: 0, y: subtitleY },
					rotate: 0,
				},
			},
		});
	}

	return trackId;
}
