import { Command } from "@/lib/commands/base-command";
import type { TimelineTrack } from "@/types/timeline";
import { EditorCore } from "@/core";
import { clampAnimationsToDuration } from "@/lib/animation";
import { isMainTrack, rippleShiftElements } from "@/lib/timeline";

export class UpdateElementTrimCommand extends Command {
	private savedState: TimelineTrack[] | null = null;
	private readonly elementId: string;
	private readonly trimStart: number;
	private readonly trimEnd: number;
	private readonly startTime: number | undefined;
	private readonly duration: number | undefined;
	private readonly rippleEnabled: boolean;
	private readonly magneticMainTrack: boolean;

	constructor({
		elementId,
		trimStart,
		trimEnd,
		startTime,
		duration,
		rippleEnabled = false,
		magneticMainTrack = false,
	}: {
		elementId: string;
		trimStart: number;
		trimEnd: number;
		startTime?: number;
		duration?: number;
		rippleEnabled?: boolean;
	/** Like CapCut's magnetic main track: removing footage there closes the gap */
	magneticMainTrack?: boolean;
	}) {
		super();
		this.elementId = elementId;
		this.trimStart = trimStart;
		this.trimEnd = trimEnd;
		this.startTime = startTime;
		this.duration = duration;
		this.rippleEnabled = rippleEnabled;
		this.magneticMainTrack = magneticMainTrack;
	}

	execute(): void {
		const editor = EditorCore.getInstance();
		this.savedState = editor.timeline.getTracks();

		const updatedTracks = this.savedState.map((track) => {
			const targetElement = track.elements.find(
				(element) => element.id === this.elementId,
			);
			if (!targetElement) return track;

			const isMagnetic = this.magneticMainTrack && isMainTrack(track);
			const nextDuration = this.duration ?? targetElement.duration;
			// On the magnetic main track the clip keeps its spot and the clips
			// after it move instead, so trimming never leaves a black gap
			const nextStartTime = isMagnetic
				? targetElement.startTime
				: (this.startTime ?? targetElement.startTime);

			const oldEndTime = targetElement.startTime + targetElement.duration;
			const newEndTime = nextStartTime + nextDuration;
			const shiftAmount = oldEndTime - newEndTime;

			const updatedElement = {
				...targetElement,
				trimStart: this.trimStart,
				trimEnd: this.trimEnd,
				startTime: nextStartTime,
				duration: nextDuration,
				animations: clampAnimationsToDuration({
					animations: targetElement.animations,
					duration: nextDuration,
				}),
			};

			if ((this.rippleEnabled || isMagnetic) && Math.abs(shiftAmount) > 0) {
				const shiftedOthers = rippleShiftElements({
					elements: track.elements.filter((element) => element.id !== this.elementId),
					afterTime: oldEndTime,
					shiftAmount,
				});
				return {
					...track,
					elements: track.elements.map((element) =>
						element.id === this.elementId
							? updatedElement
							: (shiftedOthers.find((shifted) => shifted.id === element.id) ?? element)
					),
				} as typeof track;
			}

			return {
				...track,
				elements: track.elements.map((element) =>
					element.id === this.elementId ? updatedElement : element
				),
			} as typeof track;
		});

		editor.timeline.updateTracks(updatedTracks);
	}

	undo(): void {
		if (this.savedState) {
			const editor = EditorCore.getInstance();
			editor.timeline.updateTracks(this.savedState);
		}
	}
}
