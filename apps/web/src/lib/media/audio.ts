import type {
	AudioElement,
	LibraryAudioElement,
	TimelineElement,
	TimelineTrack,
} from "@/types/timeline";
import type { MediaAsset } from "@/types/assets";
import { canElementHaveAudio } from "@/lib/timeline/element-utils";
import { canTracktHaveAudio } from "@/lib/timeline";
import { mediaSupportsAudio } from "@/lib/media/media-utils";
import { connectAudioEffectsChain } from "@/lib/audio/audio-effects";
import { timeStretch } from "@/lib/audio/time-stretch";
import {
	type ElementFade,
	getEffectiveFades,
	getFadeMultiplier,
	resolvePlaybackRateAtTime,
} from "@/lib/animation";
import { getNumberChannelForPath } from "@/lib/animation/number-channel";
import { Input, ALL_FORMATS, BlobSource, AudioBufferSink } from "mediabunny";

const MAX_AUDIO_CHANNELS = 2;
const EXPORT_SAMPLE_RATE = 44100;

export type CollectedAudioElement = Omit<
	AudioElement,
	"type" | "mediaId" | "volume" | "id" | "name" | "sourceType" | "sourceUrl"
> & {
	buffer: AudioBuffer;
	volume: number;
	playbackRate: number;
	preservePitch: boolean;
	trackId: string;
};

export function createAudioContext({ sampleRate }: { sampleRate?: number } = {}): AudioContext {
	const AudioContextConstructor =
		window.AudioContext ||
		(window as typeof window & { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;

	return new AudioContextConstructor(sampleRate ? { sampleRate } : undefined);
}

export interface DecodedAudio {
	samples: Float32Array;
	sampleRate: number;
}

export async function decodeAudioToFloat32({
	audioBlob,
}: {
	audioBlob: Blob;
}): Promise<DecodedAudio> {
	const audioContext = createAudioContext();
	const arrayBuffer = await audioBlob.arrayBuffer();
	const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

	// mix down to mono
	const numChannels = audioBuffer.numberOfChannels;
	const length = audioBuffer.length;
	const samples = new Float32Array(length);

	for (let i = 0; i < length; i++) {
		let sum = 0;
		for (let channel = 0; channel < numChannels; channel++) {
			sum += audioBuffer.getChannelData(channel)[i];
		}
		samples[i] = sum / numChannels;
	}

	return { samples, sampleRate: audioBuffer.sampleRate };
}

export async function collectAudioElements({
	tracks,
	mediaAssets,
	audioContext,
}: {
	tracks: TimelineTrack[];
	mediaAssets: MediaAsset[];
	audioContext: AudioContext;
}): Promise<CollectedAudioElement[]> {
	const mediaMap = new Map<string, MediaAsset>(
		mediaAssets.map((media) => [media.id, media]),
	);
	const pendingElements: Array<Promise<CollectedAudioElement | null>> = [];
	// Silence removal leaves dozens of clips from one file; decode it once
	const decodedMedia = new Map<string, Promise<AudioBuffer | null>>();
	const decodeMedia = (mediaAsset: MediaAsset) => {
		let decoded = decodedMedia.get(mediaAsset.id);
		if (!decoded) {
			decoded = decodeMediaAudio({ mediaAsset, audioContext });
			decodedMedia.set(mediaAsset.id, decoded);
		}
		return decoded;
	};

	for (const track of tracks) {
		if (canTracktHaveAudio(track) && track.muted) continue;

		for (const element of track.elements) {
			if (!canElementHaveAudio(element)) continue;
			if (element.duration <= 0) continue;

			const isTrackMuted = canTracktHaveAudio(track) && track.muted;

			if (element.type === "audio") {
				// Same gain rule as preview playback: clip volume only turns it down
				const volume = Math.min(element.volume ?? 1, 1);
				const buffer =
					element.sourceType === "upload"
						? (() => {
								const mediaAsset = mediaMap.get(element.mediaId);
								return mediaAsset
									? decodeMedia(mediaAsset)
									: Promise.resolve(null);
							})()
						: resolveAudioBufferForElement({ element, audioContext });
				pendingElements.push(
					buffer.then((audioBuffer) => {
						if (!audioBuffer) return null;
						return {
							buffer: audioBuffer,
							startTime: element.startTime,
							duration: element.duration,
							trimStart: element.trimStart,
							trimEnd: element.trimEnd,
							muted: element.muted || isTrackMuted,
							volume,
							playbackRate: element.playbackRate ?? 1,
							preservePitch: element.preservePitch !== false,
							animations: element.animations,
							fadeIn: element.fadeIn,
							fadeOut: element.fadeOut,
							trackId: track.id,
						};
					}),
				);
				continue;
			}

			if (element.type === "video") {
				const mediaAsset = mediaMap.get(element.mediaId);
				if (!mediaAsset || !mediaSupportsAudio({ media: mediaAsset })) continue;

				pendingElements.push(
					decodeMedia(mediaAsset).then((audioBuffer) => {
						if (!audioBuffer) return null;
						const elementMuted = element.muted ?? false;
						return {
							buffer: audioBuffer,
							startTime: element.startTime,
							duration: element.duration,
							trimStart: element.trimStart,
							trimEnd: element.trimEnd,
							muted: elementMuted || isTrackMuted,
							volume: 1,
							playbackRate: element.playbackRate ?? 1,
							preservePitch: element.preservePitch !== false,
							animations: element.animations,
							fadeIn: element.fadeIn,
							fadeOut: element.fadeOut,
							trackId: track.id,
						};
					}),
				);
			}
		}
	}

	const resolvedElements = await Promise.all(pendingElements);
	const audioElements: CollectedAudioElement[] = [];
	for (const element of resolvedElements) {
		if (element) audioElements.push(element);
	}
	return audioElements;
}

async function resolveAudioBufferForElement({
	element,
	audioContext,
}: {
	element: LibraryAudioElement;
	audioContext: AudioContext;
}): Promise<AudioBuffer | null> {
	try {
		if (element.buffer) return element.buffer;

		const response = await fetch(element.sourceUrl);
		if (!response.ok) {
			throw new Error(`Library audio fetch failed: ${response.status}`);
		}

		const arrayBuffer = await response.arrayBuffer();
		return await audioContext.decodeAudioData(arrayBuffer.slice(0));
	} catch (error) {
		console.warn("Failed to decode audio:", error);
		return null;
	}
}

/**
 * Decodes the audio of an uploaded file. "Separar áudio" makes audio clips
 * that point at the video file, so video files must be handled here too.
 */
async function decodeMediaAudio({
	mediaAsset,
	audioContext,
}: {
	mediaAsset: MediaAsset;
	audioContext: AudioContext;
}): Promise<AudioBuffer | null> {
	if (mediaAsset.type === "video") {
		return resolveAudioBufferForVideoElement({ mediaAsset, audioContext });
	}
	if (mediaAsset.type !== "audio") return null;
	try {
		const arrayBuffer = await mediaAsset.file.arrayBuffer();
		return await audioContext.decodeAudioData(arrayBuffer.slice(0));
	} catch (error) {
		console.warn("Failed to decode audio:", error);
		return null;
	}
}

async function resolveAudioBufferForVideoElement({
	mediaAsset,
	audioContext,
}: {
	mediaAsset: MediaAsset;
	audioContext: AudioContext;
}): Promise<AudioBuffer | null> {
	const input = new Input({
		source: new BlobSource(mediaAsset.file),
		formats: ALL_FORMATS,
	});

	try {
		const audioTrack = await input.getPrimaryAudioTrack();
		if (!audioTrack) return null;

		const sink = new AudioBufferSink(audioTrack);
		const targetSampleRate = audioContext.sampleRate;

		const chunks: AudioBuffer[] = [];
		let totalSamples = 0;

		for await (const { buffer } of sink.buffers(0)) {
			chunks.push(buffer);
			totalSamples += buffer.length;
		}

		if (chunks.length === 0) return null;

		const nativeSampleRate = chunks[0].sampleRate;
		const numChannels = Math.min(MAX_AUDIO_CHANNELS, chunks[0].numberOfChannels);

		const nativeChannels = Array.from(
			{ length: numChannels },
			() => new Float32Array(totalSamples),
		);
		let offset = 0;
		for (const chunk of chunks) {
			for (let channel = 0; channel < numChannels; channel++) {
				const sourceData = chunk.getChannelData(Math.min(channel, chunk.numberOfChannels - 1));
				nativeChannels[channel].set(sourceData, offset);
			}
			offset += chunk.length;
		}

		// use OfflineAudioContext for high-quality resampling to target rate
		const outputSamples = Math.ceil(totalSamples * (targetSampleRate / nativeSampleRate));
		const offlineContext = new OfflineAudioContext(numChannels, outputSamples, targetSampleRate);

		const nativeBuffer = audioContext.createBuffer(numChannels, totalSamples, nativeSampleRate);
		for (let ch = 0; ch < numChannels; ch++) {
			nativeBuffer.copyToChannel(nativeChannels[ch], ch);
		}

		const sourceNode = offlineContext.createBufferSource();
		sourceNode.buffer = nativeBuffer;
		sourceNode.connect(offlineContext.destination);
		sourceNode.start(0);

		return await offlineContext.startRendering();
	} catch (error) {
		console.warn("Failed to decode video audio:", error);
		return null;
	} finally {
		input.dispose();
	}
}

interface AudioMixSource {
	file: File;
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
}

export interface AudioClipSource {
	id: string;
	sourceKey: string;
	file: File;
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
	muted: boolean;
	volume: number;
	playbackRate: number;
	preservePitch: boolean;
	fadeIn?: number;
	fadeOut?: number;
}

async function fetchLibraryAudioSource({
	element,
}: {
	element: LibraryAudioElement;
}): Promise<AudioMixSource | null> {
	try {
		const response = await fetch(element.sourceUrl);
		if (!response.ok) {
			throw new Error(`Library audio fetch failed: ${response.status}`);
		}

		const blob = await response.blob();
		const file = new File([blob], `${element.name}.mp3`, {
			type: "audio/mpeg",
		});

		return {
			file,
			startTime: element.startTime,
			duration: element.duration,
			trimStart: element.trimStart,
			trimEnd: element.trimEnd,
		};
	} catch (error) {
		console.warn("Failed to fetch library audio:", error);
		return null;
	}
}

async function fetchLibraryAudioClip({
	element,
	muted,
}: {
	element: LibraryAudioElement;
	muted: boolean;
}): Promise<AudioClipSource | null> {
	try {
		const response = await fetch(element.sourceUrl);
		if (!response.ok) {
			throw new Error(`Library audio fetch failed: ${response.status}`);
		}

		const blob = await response.blob();
		const file = new File([blob], `${element.name}.mp3`, {
			type: "audio/mpeg",
		});

		return {
			id: element.id,
			sourceKey: element.id,
			file,
			startTime: element.startTime,
			duration: element.duration,
			trimStart: element.trimStart,
			trimEnd: element.trimEnd,
			muted,
			volume: element.volume ?? 1,
			playbackRate: element.playbackRate ?? 1,
			preservePitch: element.preservePitch !== false,
			fadeIn: element.fadeIn,
			fadeOut: element.fadeOut,
		};
	} catch (error) {
		console.warn("Failed to fetch library audio:", error);
		return null;
	}
}

function collectMediaAudioSource({
	element,
	mediaAsset,
}: {
	element: TimelineElement;
	mediaAsset: MediaAsset;
}): AudioMixSource {
	return {
		file: mediaAsset.file,
		startTime: element.startTime,
		duration: element.duration,
		trimStart: element.trimStart,
		trimEnd: element.trimEnd,
	};
}

function collectMediaAudioClip({
	element,
	mediaAsset,
	muted,
}: {
	element: TimelineElement;
	mediaAsset: MediaAsset;
	muted: boolean;
}): AudioClipSource {
	const vol = "volume" in element ? (element as { volume?: number }).volume ?? 1 : 1;
	return {
		id: element.id,
		sourceKey: mediaAsset.id,
		file: mediaAsset.file,
		startTime: element.startTime,
		duration: element.duration,
		trimStart: element.trimStart,
		trimEnd: element.trimEnd,
		muted,
		volume: vol,
		playbackRate:
			"playbackRate" in element ? (element.playbackRate ?? 1) : 1,
		preservePitch:
			"preservePitch" in element ? element.preservePitch !== false : true,
		fadeIn: element.fadeIn,
		fadeOut: element.fadeOut,
	};
}

export async function collectAudioMixSources({
	tracks,
	mediaAssets,
}: {
	tracks: TimelineTrack[];
	mediaAssets: MediaAsset[];
}): Promise<AudioMixSource[]> {
	const audioMixSources: AudioMixSource[] = [];
	const mediaMap = new Map<string, MediaAsset>(
		mediaAssets.map((asset) => [asset.id, asset]),
	);
	const pendingLibrarySources: Array<Promise<AudioMixSource | null>> = [];

	for (const track of tracks) {
		if (canTracktHaveAudio(track) && track.muted) continue;

		for (const element of track.elements) {
			if (!canElementHaveAudio(element)) continue;

			if (element.type === "audio") {
				if (element.sourceType === "upload") {
					const mediaAsset = mediaMap.get(element.mediaId);
					if (!mediaAsset) continue;

					audioMixSources.push(
						collectMediaAudioSource({ element, mediaAsset }),
					);
				} else {
					pendingLibrarySources.push(fetchLibraryAudioSource({ element }));
				}
				continue;
			}

			if (element.type === "video") {
				const mediaAsset = mediaMap.get(element.mediaId);
				if (!mediaAsset) continue;

				if (mediaSupportsAudio({ media: mediaAsset })) {
					audioMixSources.push(
						collectMediaAudioSource({ element, mediaAsset }),
					);
				}
			}
		}
	}

	const resolvedLibrarySources = await Promise.all(pendingLibrarySources);
	for (const source of resolvedLibrarySources) {
		if (source) audioMixSources.push(source);
	}

	return audioMixSources;
}

export async function collectAudioClips({
	tracks,
	mediaAssets,
}: {
	tracks: TimelineTrack[];
	mediaAssets: MediaAsset[];
}): Promise<AudioClipSource[]> {
	const clips: AudioClipSource[] = [];
	const mediaMap = new Map<string, MediaAsset>(
		mediaAssets.map((asset) => [asset.id, asset]),
	);
	const pendingLibraryClips: Array<Promise<AudioClipSource | null>> = [];

	for (const track of tracks) {
		const isTrackMuted = canTracktHaveAudio(track) && track.muted;

		for (const element of track.elements) {
			if (!canElementHaveAudio(element)) continue;

			const isElementMuted =
				"muted" in element ? (element.muted ?? false) : false;
			const muted = isTrackMuted || isElementMuted;

			if (element.type === "audio") {
				if (element.sourceType === "upload") {
					const mediaAsset = mediaMap.get(element.mediaId);
					if (!mediaAsset) continue;

					clips.push(
						collectMediaAudioClip({
							element,
							mediaAsset,
							muted,
						}),
					);
				} else {
					pendingLibraryClips.push(fetchLibraryAudioClip({ element, muted }));
				}
				continue;
			}

			if (element.type === "video") {
				const mediaAsset = mediaMap.get(element.mediaId);
				if (!mediaAsset) continue;

				if (mediaSupportsAudio({ media: mediaAsset })) {
					clips.push(
						collectMediaAudioClip({
							element,
							mediaAsset,
							muted,
						}),
					);
				}
			}
		}
	}

	const resolvedLibraryClips = await Promise.all(pendingLibraryClips);
	for (const clip of resolvedLibraryClips) {
		if (clip) clips.push(clip);
	}

	return clips;
}

export async function createTimelineAudioBuffer({
	tracks,
	mediaAssets,
	duration,
	sampleRate = EXPORT_SAMPLE_RATE,
	audioContext,
}: {
	tracks: TimelineTrack[];
	mediaAssets: MediaAsset[];
	duration: number;
	sampleRate?: number;
	audioContext?: AudioContext;
}): Promise<AudioBuffer | null> {
	const context = audioContext ?? createAudioContext({ sampleRate });

	const audioElements = await collectAudioElements({
		tracks,
		mediaAssets,
		audioContext: context,
	});

	if (audioElements.length === 0) return null;

	const outputLength = Math.ceil(duration * sampleRate);
	const offline = new OfflineAudioContext(2, outputLength, sampleRate);

	// Same per-track graph as preview playback: gain -> effects -> pan
	const trackInputs = new Map<string, AudioNode>();
	const getTrackInput = (trackId: string): AudioNode => {
		const existing = trackInputs.get(trackId);
		if (existing) return existing;

		const track = tracks.find((candidate) => candidate.id === trackId);
		const gain = offline.createGain();
		gain.gain.value = (track && "volume" in track ? track.volume : undefined) ?? 1;
		const panner = offline.createStereoPanner();
		panner.pan.value = (track && "pan" in track ? track.pan : undefined) ?? 0;
		connectAudioEffectsChain({
			ctx: offline,
			input: gain,
			output: panner,
			effects:
				(track && "audioEffects" in track ? track.audioEffects : undefined) ??
				[],
		});
		panner.connect(offline.destination);
		trackInputs.set(trackId, gain);
		return gain;
	};

	for (const element of audioElements) {
		if (element.muted) continue;
		const clip = renderClipAtSpeed({ element, context: offline, sampleRate });
		if (!clip) continue;

		const source = offline.createBufferSource();
		source.buffer = clip;
		source.connect(getTrackInput(element.trackId));
		source.start(Math.max(0, element.startTime));
	}

	return await offline.startRendering();
}

// Fixed-rate steps between speed-curve lookups (about 3 ms at 44.1 kHz)
const SPEED_BLOCK_SAMPLES = 128;

/**
 * The clip's audio as it plays on the timeline: speed (constant or curve)
 * maps timeline time to source time exactly like the video renderer does,
 * so picture and sound stay in sync. With preservePitch the audio is
 * time-stretched so speed doesn't change the pitch.
 */
function renderClipAtSpeed({
	element,
	context,
	sampleRate,
}: {
	element: CollectedAudioElement;
	context: BaseAudioContext;
	sampleRate: number;
}): AudioBuffer | null {
	const {
		buffer,
		trimStart,
		duration,
		playbackRate,
		animations,
		volume,
		preservePitch,
		fadeIn,
		fadeOut,
	} = element;
	const fade = { duration, fadeIn, fadeOut };
	const length = Math.round(duration * sampleRate);
	if (length <= 0) return null;

	const hasSpeedCurve =
		(getNumberChannelForPath({ animations, propertyPath: "playbackRate" })
			?.keyframes.length ?? 0) > 0;
	const rateAt = (outputSample: number) =>
		hasSpeedCurve
			? resolvePlaybackRateAtTime({
					basePlaybackRate: playbackRate,
					animations,
					localTime: outputSample / sampleRate,
				})
			: playbackRate;

	// Decoded buffers already share the export rate; a mismatch falls back
	// to plain resampling, which is still in sync, just not pitch-corrected
	if (
		preservePitch &&
		(hasSpeedCurve || playbackRate !== 1) &&
		buffer.sampleRate === sampleRate
	) {
		const channels = [0, 1].map((channel) =>
			buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1)),
		);
		const stretched = timeStretch({
			channels,
			sourceStart: Math.round(trimStart * sampleRate),
			outputLength: length,
			sampleRate,
			rateAt,
		});
		const output = context.createBuffer(2, length, sampleRate);
		for (let channel = 0; channel < 2; channel++) {
			const data = output.getChannelData(channel);
			const source = stretched[channel];
			for (let i = 0; i < length; i++) data[i] = source[i] * volume;
		}
		applyFade({ output, sampleRate, fade });
		return output;
	}
	const sourceRatio = buffer.sampleRate / sampleRate;
	const sources = [0, 1].map((channel) =>
		buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1)),
	);
	const sourceLength = sources[0].length;
	const output = context.createBuffer(2, length, sampleRate);
	const outputs = [output.getChannelData(0), output.getChannelData(1)];

	let position = trimStart * buffer.sampleRate;
	render: for (let block = 0; block < length; block += SPEED_BLOCK_SAMPLES) {
		const step = Math.max(0, rateAt(block)) * sourceRatio;
		const blockEnd = Math.min(length, block + SPEED_BLOCK_SAMPLES);

		for (let i = block; i < blockEnd; i++) {
			const index = Math.floor(position);
			if (index + 1 >= sourceLength) break render;
			const fraction = position - index;
			for (let channel = 0; channel < 2; channel++) {
				const source = sources[channel];
				outputs[channel][i] =
					(source[index] + (source[index + 1] - source[index]) * fraction) *
					volume;
			}
			position += step;
		}
	}

	applyFade({ output, sampleRate, fade });
	return output;
}

/**
 * Multiplies the clip's fade in/out into its samples, with the same curve
 * the picture and the preview playback use. Only the fade regions change.
 */
export function applyFade({
	output,
	sampleRate,
	fade,
}: {
	output: AudioBuffer;
	sampleRate: number;
	fade: ElementFade;
}): void {
	const { fadeIn, fadeOut } = getEffectiveFades(fade);
	if (fadeIn <= 0 && fadeOut <= 0) return;

	const channels = Array.from({ length: output.numberOfChannels }, (_, c) =>
		output.getChannelData(c),
	);
	const fadeInEnd = Math.min(output.length, Math.ceil(fadeIn * sampleRate));
	const fadeOutStart = Math.max(
		fadeInEnd,
		output.length - Math.ceil(fadeOut * sampleRate),
	);
	const scale = (i: number) => {
		const gain = getFadeMultiplier({ ...fade, localTime: i / sampleRate });
		for (const data of channels) data[i] *= gain;
	};
	for (let i = 0; i < fadeInEnd; i++) scale(i);
	for (let i = fadeOutStart; i < output.length; i++) scale(i);
}
