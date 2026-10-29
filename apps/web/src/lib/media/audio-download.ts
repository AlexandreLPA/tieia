import { aiClient } from "@/lib/ai-client";
import { audioBufferToWav } from "@/lib/tiktok-kit/sfx";
import type { ExportQuality } from "@/types/export";

export type AudioDownloadFormat = "mp3" | "wav";

/** MP3 kbit/s for each export quality */
export const MP3_BITRATE: Record<ExportQuality, number> = {
	low: 128,
	medium: 192,
	high: 256,
	very_high: 320,
};

/** Any audio the browser can play, as a 16-bit WAV (made here, nothing is sent). */
export async function toWav(audio: Blob): Promise<Blob> {
	if (audio.type === "audio/wav" || audio.type === "audio/x-wav") return audio;
	const context = new AudioContext();
	try {
		return audioBufferToWav(await context.decodeAudioData(await audio.arrayBuffer()));
	} finally {
		void context.close();
	}
}

/**
 * The audio in the format to download. WAV is written in the browser; MP3 by
 * the local ai-backend's ffmpeg, since browsers cannot encode it.
 */
export async function encodeForDownload(
	audio: Blob | AudioBuffer,
	format: AudioDownloadFormat,
	bitrate = MP3_BITRATE.medium,
): Promise<Blob> {
	const wav = audio instanceof Blob ? await toWav(audio) : audioBufferToWav(audio);
	return format === "wav" ? wav : aiClient.convertAudioToMp3(wav, bitrate);
}
