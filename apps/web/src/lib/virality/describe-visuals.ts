import type { EditorCore } from "@/core";
import { aiClient } from "@/lib/ai-client";
import type { ChatContentPart, VisionSupport } from "@/lib/ai-client";
import {
	captureComplianceFrames,
	type FrameDensity,
} from "@/services/compliance/capture-frames";

/** The first seconds of an edit, which the viral score reads as the hook. */
export const HOOK_SECONDS = 3;

// A cloud model reads more frames than one running on this PC
const CLOUD_DENSITY: FrameDensity = {
	secondsPerFrame: 2,
	minFrames: 8,
	maxFrames: 16,
};
const LOCAL_DENSITY: FrameDensity = {
	secondsPerFrame: 4,
	minFrames: 6,
	maxFrames: 8,
};

export interface VisualReading {
	/** What the whole video shows, in Portuguese */
	description: string;
	/** What the first seconds show; empty when the model did not separate it */
	hook: string;
	/** The model that looked, and whether the frames left this computer */
	model: string;
	cloud: boolean;
	frames: number;
}

function clock(seconds: number): string {
	return `${seconds.toFixed(1).replace(".", ",")} s`;
}

/** The question asked with the frames; the answer format is parsed below. */
export function buildReadingPrompt(times: number[]): string {
	return `Estes são ${times.length} quadros de um vídeo curto, em ordem, cada um com o seu tempo no vídeo. O vídeo pode não ter som nem fala.

Descreva em português do Brasil o que o vídeo mostra, de forma concreta e objetiva (de 5 a 10 frases): quem ou o que aparece, o que está sendo mostrado ou vendido, o que muda de um quadro para o outro, os textos escritos na tela e o clima. Não invente falas nem sons: descreva só o que se vê.

Responda exatamente neste formato, em duas linhas:
GANCHO: o que aparece nos primeiros ${HOOK_SECONDS} segundos
VÍDEO: a descrição do vídeo inteiro`;
}

/** Splits the model's answer into the hook and the whole-video description. */
export function parseReading(answer: string): {
	hook: string;
	description: string;
} {
	const text = answer.trim();
	const hook =
		/GANCHO:\s*([\s\S]*?)(?=\n\s*V[ÍI]DEO:|$)/i.exec(text)?.[1]?.trim() ?? "";
	const video = /V[ÍI]DEO:\s*([\s\S]*)$/i.exec(text)?.[1]?.trim();
	// A model that ignored the format still gave a description
	return { hook, description: video || text };
}

/**
 * Has a vision model look at frames of the edit and describe them. Used by
 * the viral score for a video with no speech to read: the description stands
 * where the transcript would be. Throws a sentence for the user when the
 * active model cannot see images or does not answer.
 */
export async function describeVideoVisuals({
	editor,
	onProgress,
}: {
	editor: EditorCore;
	onProgress?: (label: string) => void;
}): Promise<VisualReading> {
	const support: VisionSupport = await aiClient.getVisionSupport();
	if (!support.ok) {
		throw new Error(
			support.reason ||
				"O modelo de chat atual não enxerga imagens. Escolha um com visão, como o Nemotron 3.5 Super VL, no seletor de modelo do chat.",
		);
	}

	const frames = await captureComplianceFrames(
		editor,
		(current, total) =>
			onProgress?.(`Capturando quadros do vídeo ${current}/${total}`),
		support.cloud ? CLOUD_DENSITY : LOCAL_DENSITY,
	);

	onProgress?.(
		support.cloud
			? `Enviando ${frames.length} quadros ao modelo em nuvem...`
			: `O modelo está olhando ${frames.length} quadros...`,
	);
	const parts: ChatContentPart[] = [
		{ type: "text", text: buildReadingPrompt(frames.map((f) => f.time)) },
	];
	for (const [index, frame] of frames.entries()) {
		parts.push({
			type: "text",
			text: `Quadro ${index + 1} (${clock(frame.time)}):`,
		});
		parts.push({ type: "image_url", image_url: { url: frame.dataUrl } });
	}

	const { response } = await aiClient.chatStreamMessages(
		[{ role: "user", content: parts }],
		() => {},
	);
	const { hook, description } = parseReading(response);
	if (!description) {
		throw new Error(
			"O modelo não descreveu as imagens. Tente de novo em instantes.",
		);
	}
	return {
		description,
		hook,
		model: support.model,
		cloud: support.cloud,
		frames: frames.length,
	};
}
