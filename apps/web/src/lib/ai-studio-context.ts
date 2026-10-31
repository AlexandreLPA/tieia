import type { EditorCore } from "@/core";
import type { ChatContentPart } from "@/lib/ai-client";
import type { CapturedFrame } from "@/services/compliance/capture-frames";
import type { TranscriptionSegment } from "@/types/ai";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";

const MAX_TIMELINE_CHARS = 6000;
const MAX_TRANSCRIPT_CHARS = 12_000;
const ATTACHMENT_MAX_SIDE = 1024;
const ATTACHMENT_QUALITY = 0.85;

const TRACK_LABELS: Record<TimelineTrack["type"], string> = {
	video: "vídeo",
	text: "texto",
	audio: "áudio",
	sticker: "figurinhas",
	effect: "efeitos",
};

export function formatClock(seconds: number): string {
	const safe = Math.max(0, seconds);
	const minutes = Math.floor(safe / 60);
	const rest = (safe - minutes * 60).toFixed(1).padStart(4, "0");
	return `${minutes}:${rest}`;
}

function truncate(text: string, limit: number, marker: string): string {
	return text.length <= limit ? text : `${text.slice(0, limit)}\n${marker}`;
}

function describeElement(element: TimelineElement): string {
	const range = `${formatClock(element.startTime)}–${formatClock(element.startTime + element.duration)}`;
	const flags: string[] = [];
	if ("hidden" in element && element.hidden) flags.push("oculto");
	if ("muted" in element && element.muted) flags.push("sem som");
	if (
		"playbackRate" in element &&
		element.playbackRate &&
		element.playbackRate !== 1
	) {
		flags.push(`${element.playbackRate}x`);
	}
	const suffix = flags.length > 0 ? ` (${flags.join(", ")})` : "";

	switch (element.type) {
		case "text":
			return `${range} texto na tela "${element.content.replace(/\s+/g, " ").trim()}"${suffix}`;
		case "video":
			return `${range} vídeo "${element.name}"${suffix}`;
		case "image":
			return `${range} imagem "${element.name}"${suffix}`;
		case "audio":
			return `${range} áudio "${element.name}"${suffix}`;
		case "sticker":
			return `${range} figurinha "${element.name}"${suffix}`;
		case "effect":
			return `${range} efeito ${element.effectType}${suffix}`;
	}
}

/** Plain-text overview of the open project's timeline for the model. */
export function buildTimelineSummary(editor: EditorCore): string {
	const project = editor.project.getActiveOrNull();
	const tracks = editor.timeline.getTracks();
	const duration = editor.timeline.getTotalDuration();
	const lines: string[] = [];

	if (project) {
		const { canvasSize, fps } = project.settings;
		lines.push(
			`Duração total: ${formatClock(duration)} · tela ${canvasSize.width}x${canvasSize.height} · ${fps} fps`,
		);
	}
	if (tracks.every((track) => track.elements.length === 0)) {
		lines.push("A timeline está vazia.");
		return lines.join("\n");
	}

	for (const [index, track] of tracks.entries()) {
		const flags: string[] = [];
		if ("hidden" in track && track.hidden) flags.push("oculta");
		if ("muted" in track && track.muted) flags.push("sem som");
		lines.push(
			`Faixa ${index + 1} — ${TRACK_LABELS[track.type]}${flags.length > 0 ? ` (${flags.join(", ")})` : ""}: ${track.elements.length} elemento(s)`,
		);
		const elements = [...track.elements].sort(
			(a, b) => a.startTime - b.startTime,
		);
		for (const element of elements) {
			lines.push(`  - ${describeElement(element)}`);
		}
	}
	return truncate(lines.join("\n"), MAX_TIMELINE_CHARS, "[timeline truncada]");
}

export function buildTranscriptBlock(segments: TranscriptionSegment[]): string {
	const spoken = segments.filter((segment) => segment.text.trim());
	if (spoken.length === 0) {
		return "TRANSCRIÇÃO: não disponível (o vídeo ainda não foi transcrito ou não tem fala).";
	}
	const lines = spoken.map(
		(segment) =>
			`[${formatClock(segment.start)}–${formatClock(segment.end)}] ${segment.text.trim()}`,
	);
	return `TRANSCRIÇÃO automática (pode ter erros):\n${truncate(lines.join("\n"), MAX_TRANSCRIPT_CHARS, "[transcrição truncada]")}`;
}

/** Changes whenever what the frames would show changes, so cached frames can be reused. */
export function getTimelineSignature(editor: EditorCore): string {
	const project = editor.project.getActiveOrNull();
	return JSON.stringify({
		tracks: editor.timeline.getTracks(),
		canvasSize: project?.settings.canvasSize,
		background: project?.settings.background,
	});
}

/** First user turn of every request: timeline, transcript and (optionally) frames. */
export function buildContextParts({
	timeline,
	transcript,
	frames,
	framesNote,
}: {
	timeline: string;
	transcript: string;
	frames: CapturedFrame[];
	framesNote: string;
}): ChatContentPart[] {
	const header = [
		"CONTEXTO DO PROJETO ABERTO NA PASSAROLA (enviado automaticamente pelo editor, não é uma pergunta).",
		`TIMELINE:\n${timeline}`,
		transcript,
		frames.length > 0
			? `QUADROS DO VÍDEO: ${frames.length} quadros tirados da timeline montada, em ordem de tempo.`
			: framesNote,
	].join("\n\n");

	return [
		{ type: "text", text: header },
		...frames.flatMap((frame, index): ChatContentPart[] => [
			{
				type: "text",
				text: `Quadro ${index + 1} — ${formatClock(frame.time)} (t=${frame.time.toFixed(1)}s)`,
			},
			{ type: "image_url", image_url: { url: frame.dataUrl } },
		]),
	];
}

/** Downscale an attached/pasted image to a JPEG data URL small enough for the backend limit. */
export async function imageFileToDataUrl(file: File): Promise<string> {
	const bitmap = await createImageBitmap(file);
	try {
		const scale = Math.min(
			1,
			ATTACHMENT_MAX_SIDE / Math.max(bitmap.width, bitmap.height),
		);
		const canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.round(bitmap.width * scale));
		canvas.height = Math.max(1, Math.round(bitmap.height * scale));
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Não foi possível processar a imagem");
		context.fillStyle = "#fff";
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		return canvas.toDataURL("image/jpeg", ATTACHMENT_QUALITY);
	} finally {
		bitmap.close();
	}
}
