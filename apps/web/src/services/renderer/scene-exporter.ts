import EventEmitter from "eventemitter3";

import {
	Output,
	Mp4OutputFormat,
	WebMOutputFormat,
	BufferTarget,
	CanvasSource,
	AudioBufferSource,
	QUALITY_LOW,
	QUALITY_MEDIUM,
	QUALITY_HIGH,
	QUALITY_VERY_HIGH,
} from "mediabunny";
import type { RootNode } from "./nodes/root-node";
import type { ExportFormat, ExportQuality } from "@/types/export";
import { CanvasRenderer } from "./canvas-renderer";
import { createOffscreenCanvas } from "./canvas-utils";

type ExportParams = {
	width: number;
	height: number;
	// Size of the encoded frames; the scene is drawn at width x height and
	// scaled to this when it differs
	outputWidth?: number;
	outputHeight?: number;
	fps: number;
	format: ExportFormat;
	quality: ExportQuality;
	shouldIncludeAudio?: boolean;
	audioBuffer?: AudioBuffer;
	watermark?: boolean;
};

const qualityMap = {
	low: QUALITY_LOW,
	medium: QUALITY_MEDIUM,
	high: QUALITY_HIGH,
	very_high: QUALITY_VERY_HIGH,
};

// Audio-only exports encode in slices so progress moves and cancel works
const AUDIO_CHUNK_SECONDS = 10;

export type SceneExporterEvents = {
	progress: [progress: number];
	complete: [buffer: ArrayBuffer];
	error: [error: Error];
	cancelled: [];
};

export class SceneExporter extends EventEmitter<SceneExporterEvents> {
	private renderer: CanvasRenderer;
	private frameCanvas: OffscreenCanvas | HTMLCanvasElement;
	private frameContext:
		| OffscreenCanvasRenderingContext2D
		| CanvasRenderingContext2D
		| null = null;
	private format: ExportFormat;
	private quality: ExportQuality;
	private shouldIncludeAudio: boolean;
	private audioBuffer?: AudioBuffer;

	private isCancelled = false;

	constructor({
		width,
		height,
		outputWidth = width,
		outputHeight = height,
		fps,
		format,
		quality,
		shouldIncludeAudio,
		audioBuffer,
		watermark,
	}: ExportParams) {
		super();
		this.renderer = new CanvasRenderer({
			width,
			height,
			fps,
			watermark: watermark ?? false,
		});

		this.frameCanvas = this.renderer.canvas;
		if (outputWidth !== width || outputHeight !== height) {
			this.frameCanvas = createOffscreenCanvas({
				width: outputWidth,
				height: outputHeight,
			});
			const context = this.frameCanvas.getContext("2d") as
				| OffscreenCanvasRenderingContext2D
				| CanvasRenderingContext2D
				| null;
			if (!context) {
				throw new Error("Failed to get export canvas context");
			}
			context.imageSmoothingEnabled = true;
			context.imageSmoothingQuality = "high";
			this.frameContext = context;
		}

		this.format = format;
		this.quality = quality;
		this.shouldIncludeAudio = shouldIncludeAudio ?? false;
		this.audioBuffer = audioBuffer;
	}

	cancel(): void {
		this.isCancelled = true;
	}

	async export({
		rootNode,
	}: {
		rootNode: RootNode;
	}): Promise<ArrayBuffer | null> {
		const { fps } = this.renderer;
		const frameCount = Math.ceil(rootNode.duration * fps);

		const outputFormat =
			this.format === "webm" ? new WebMOutputFormat() : new Mp4OutputFormat();

		const output = new Output({
			format: outputFormat,
			target: new BufferTarget(),
		});

		const videoSource = new CanvasSource(this.frameCanvas, {
			codec: this.format === "webm" ? "vp9" : "avc",
			bitrate: qualityMap[this.quality],
		});

		output.addVideoTrack(videoSource, { frameRate: fps });

		let audioSource: AudioBufferSource | null = null;
		if (this.shouldIncludeAudio && this.audioBuffer) {
			audioSource = await this.createAudioSource({
				audioBuffer: this.audioBuffer,
			});
			output.addAudioTrack(audioSource);
		}

		await output.start();

		if (audioSource && this.audioBuffer) {
			await audioSource.add(this.audioBuffer);
			audioSource.close();
		}

		for (let i = 0; i < frameCount; i++) {
			if (this.isCancelled) {
				await output.cancel();
				this.emit("cancelled");
				return null;
			}

			const time = i / fps;
			await this.renderer.render({ node: rootNode, time });
			if (this.frameContext) {
				this.frameContext.drawImage(
					this.renderer.canvas,
					0,
					0,
					this.frameCanvas.width,
					this.frameCanvas.height,
				);
			}
			await videoSource.add(time, 1 / fps);

			this.emit("progress", i / frameCount);
		}

		if (this.isCancelled) {
			await output.cancel();
			this.emit("cancelled");
			return null;
		}

		videoSource.close();
		await output.finalize();
		this.emit("progress", 1);

		const buffer = output.target.buffer;
		if (!buffer) {
			this.emit("error", new Error("Failed to export video"));
			return null;
		}

		this.emit("complete", buffer);
		return buffer;
	}

	// MP4 holds a lone audio track fine (ISOBMFF needs only one track of any
	// kind), which players open as .m4a
	async exportAudio(): Promise<ArrayBuffer | null> {
		const audioBuffer = this.audioBuffer;
		if (!audioBuffer) {
			this.emit("error", new Error("No audio to export"));
			return null;
		}

		const output = new Output({
			format: new Mp4OutputFormat(),
			target: new BufferTarget(),
		});
		const audioSource = await this.createAudioSource({ audioBuffer });
		output.addAudioTrack(audioSource);
		await output.start();

		const { sampleRate, numberOfChannels, length } = audioBuffer;
		const chunkLength = AUDIO_CHUNK_SECONDS * sampleRate;

		for (let start = 0; start < length; start += chunkLength) {
			if (this.isCancelled) {
				await output.cancel();
				this.emit("cancelled");
				return null;
			}

			const end = Math.min(start + chunkLength, length);
			const chunk = new AudioBuffer({
				length: end - start,
				numberOfChannels,
				sampleRate,
			});
			for (let channel = 0; channel < numberOfChannels; channel++) {
				chunk.copyToChannel(
					audioBuffer.getChannelData(channel).subarray(start, end),
					channel,
				);
			}
			await audioSource.add(chunk);

			this.emit("progress", end / length);
		}

		if (this.isCancelled) {
			await output.cancel();
			this.emit("cancelled");
			return null;
		}

		audioSource.close();
		await output.finalize();
		this.emit("progress", 1);

		const buffer = output.target.buffer;
		if (!buffer) {
			this.emit("error", new Error("Failed to export audio"));
			return null;
		}

		this.emit("complete", buffer);
		return buffer;
	}

	private async createAudioSource({
		audioBuffer,
	}: {
		audioBuffer: AudioBuffer;
	}): Promise<AudioBufferSource> {
		let audioCodec: "aac" | "opus" = this.format === "webm" ? "opus" : "aac";

		if (audioCodec === "aac" && typeof AudioEncoder !== "undefined") {
			const { supported } = await AudioEncoder.isConfigSupported({
				codec: "mp4a.40.2",
				sampleRate: audioBuffer.sampleRate,
				numberOfChannels: audioBuffer.numberOfChannels,
				bitrate: 192000,
			});
			if (!supported) audioCodec = "opus";
		}

		return new AudioBufferSource({
			codec: audioCodec,
			bitrate: qualityMap[this.quality],
		});
	}
}
