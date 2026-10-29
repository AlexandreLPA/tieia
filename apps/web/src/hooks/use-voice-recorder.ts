import { useCallback, useEffect, useRef, useState } from "react";
import { audioBufferToWav } from "@/lib/tiktok-kit/sfx";

/** A clone needs no more than this; the recording stops by itself */
const MAX_SECONDS = 30;

export type RecorderState = "idle" | "recording" | "processing";

/**
 * Records the microphone for a voice clone and hands back a WAV file.
 * Echo cancellation, noise suppression and auto gain stay off: they change
 * the timbre, and the clone should sound like the person, not the filter.
 */
export function useVoiceRecorder({ onRecorded }: { onRecorded: (file: File) => void }) {
	const [state, setState] = useState<RecorderState>("idle");
	const [seconds, setSeconds] = useState(0);
	/** 0 to 1, for the level meter */
	const [level, setLevel] = useState(0);
	const [error, setError] = useState<string | null>(null);

	const recorderRef = useRef<MediaRecorder | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const contextRef = useRef<AudioContext | null>(null);
	const frameRef = useRef<number | null>(null);
	const onRecordedRef = useRef(onRecorded);
	onRecordedRef.current = onRecorded;

	const release = useCallback(() => {
		if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
		frameRef.current = null;
		for (const track of streamRef.current?.getTracks() ?? []) track.stop();
		streamRef.current = null;
		void contextRef.current?.close().catch(() => {});
		contextRef.current = null;
		setLevel(0);
	}, []);

	useEffect(() => () => {
		if (recorderRef.current?.state === "recording") recorderRef.current.stop();
		release();
	}, [release]);

	const stop = useCallback(() => {
		if (recorderRef.current?.state === "recording") recorderRef.current.stop();
	}, []);

	const start = useCallback(async () => {
		setError(null);
		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
			});
		} catch {
			setError("Não consegui usar o microfone. Libere o acesso no navegador e tente de novo.");
			return;
		}
		streamRef.current = stream;

		const context = new AudioContext();
		contextRef.current = context;
		const analyser = context.createAnalyser();
		analyser.fftSize = 1024;
		context.createMediaStreamSource(stream).connect(analyser);
		const samples = new Float32Array(analyser.fftSize);
		const startedAt = performance.now();
		const tick = () => {
			analyser.getFloatTimeDomainData(samples);
			let sum = 0;
			for (const sample of samples) sum += sample * sample;
			// RMS on a log scale, so normal speech fills about two thirds of the meter
			const db = 10 * Math.log10(sum / samples.length + 1e-10);
			setLevel(Math.max(0, Math.min(1, (db + 60) / 50)));
			const elapsed = (performance.now() - startedAt) / 1000;
			setSeconds(elapsed);
			if (elapsed >= MAX_SECONDS) {
				stop();
				return;
			}
			frameRef.current = requestAnimationFrame(tick);
		};

		const chunks: Blob[] = [];
		const recorder = new MediaRecorder(stream);
		recorderRef.current = recorder;
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) chunks.push(event.data);
		};
		recorder.onstop = async () => {
			release();
			setState("processing");
			try {
				const recorded = new Blob(chunks, { type: recorder.mimeType });
				const decoder = new AudioContext();
				const buffer = await decoder.decodeAudioData(await recorded.arrayBuffer());
				void decoder.close();
				onRecordedRef.current(
					new File([audioBufferToWav(buffer)], "gravacao.wav", { type: "audio/wav" }),
				);
			} catch {
				setError("A gravação não pôde ser lida. Tente gravar de novo.");
			} finally {
				setState("idle");
			}
		};

		setSeconds(0);
		recorder.start();
		setState("recording");
		frameRef.current = requestAnimationFrame(tick);
	}, [release, stop]);

	return { state, seconds, level, error, start, stop, maxSeconds: MAX_SECONDS };
}
