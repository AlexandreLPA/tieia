/**
 * Short sound effects for punchy edits, synthesized in the browser so they
 * carry no licensing strings: a whoosh for motion, a "poink" for pop-ups, a
 * deep hit for reveals, a ding for prices, a riser for build-ups.
 */

export type SfxKind = "whoosh" | "poink" | "impact" | "ding" | "riser";

export const SFX_LABELS: Record<SfxKind, { name: string; hint: string }> = {
	whoosh: { name: "Whoosh", hint: "Passagem rápida, troca de cena" },
	poink: { name: "Poink", hint: "Quando a seta ou o texto aparece" },
	impact: { name: "Impacto", hint: "Batida grave de revelação (efeito “chocado”)" },
	ding: { name: "Ding", hint: "Preço, desconto, ideia" },
	riser: { name: "Subida", hint: "Cria expectativa antes do clímax" },
};

const SAMPLE_RATE = 44100;

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
	const buffer = ctx.createBuffer(1, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
	return buffer;
}

function envelope(
	param: AudioParam,
	points: [time: number, value: number][],
	exponential = false,
) {
	param.setValueAtTime(points[0][1], points[0][0]);
	for (const [time, value] of points.slice(1)) {
		if (exponential) param.exponentialRampToValueAtTime(Math.max(value, 0.0001), time);
		else param.linearRampToValueAtTime(value, time);
	}
}

const DURATIONS: Record<SfxKind, number> = {
	whoosh: 0.55,
	poink: 0.35,
	impact: 1.4,
	ding: 1.2,
	riser: 1.6,
};

function build(kind: SfxKind, ctx: OfflineAudioContext) {
	const out = ctx.createGain();
	out.connect(ctx.destination);

	if (kind === "whoosh") {
		const src = ctx.createBufferSource();
		src.buffer = noiseBuffer(ctx, 0.55);
		const band = ctx.createBiquadFilter();
		band.type = "bandpass";
		band.Q.value = 1.4;
		envelope(band.frequency, [[0, 300], [0.3, 3200], [0.55, 900]], true);
		const gain = ctx.createGain();
		envelope(gain.gain, [[0, 0], [0.22, 0.9], [0.55, 0]]);
		src.connect(band).connect(gain).connect(out);
		src.start();
	}

	if (kind === "poink") {
		const osc = ctx.createOscillator();
		osc.type = "sine";
		envelope(osc.frequency, [[0, 380], [0.08, 1250], [0.3, 900]], true);
		const gain = ctx.createGain();
		envelope(gain.gain, [[0, 0], [0.01, 0.8], [0.3, 0.0001]], true);
		osc.connect(gain).connect(out);
		osc.start();
		osc.stop(0.35);
	}

	if (kind === "impact") {
		// Deep pitched boom plus a short noise crack, softly clipped
		const osc = ctx.createOscillator();
		osc.type = "sine";
		envelope(osc.frequency, [[0, 120], [0.25, 46], [1.3, 38]], true);
		const shaper = ctx.createWaveShaper();
		const curve = new Float32Array(1024);
		for (let i = 0; i < curve.length; i++) {
			const x = (i / (curve.length - 1)) * 2 - 1;
			curve[i] = Math.tanh(x * 2.4);
		}
		shaper.curve = curve;
		const gain = ctx.createGain();
		envelope(gain.gain, [[0, 0], [0.01, 1], [1.35, 0.0001]], true);
		osc.connect(shaper).connect(gain).connect(out);
		osc.start();
		osc.stop(1.4);

		const crack = ctx.createBufferSource();
		crack.buffer = noiseBuffer(ctx, 0.12);
		const low = ctx.createBiquadFilter();
		low.type = "lowpass";
		low.frequency.value = 1800;
		const crackGain = ctx.createGain();
		envelope(crackGain.gain, [[0, 0.6], [0.12, 0.0001]], true);
		crack.connect(low).connect(crackGain).connect(out);
		crack.start();
	}

	if (kind === "ding") {
		for (const [freq, level] of [[1320, 0.5], [2640, 0.18], [3960, 0.07]] as const) {
			const osc = ctx.createOscillator();
			osc.type = "sine";
			osc.frequency.value = freq;
			const gain = ctx.createGain();
			envelope(gain.gain, [[0, 0], [0.005, level], [1.15, 0.0001]], true);
			osc.connect(gain).connect(out);
			osc.start();
			osc.stop(1.2);
		}
	}

	if (kind === "riser") {
		const src = ctx.createBufferSource();
		src.buffer = noiseBuffer(ctx, 1.6);
		const band = ctx.createBiquadFilter();
		band.type = "bandpass";
		band.Q.value = 2;
		envelope(band.frequency, [[0, 400], [1.5, 6000]], true);
		const osc = ctx.createOscillator();
		osc.type = "sawtooth";
		envelope(osc.frequency, [[0, 110], [1.5, 880]], true);
		const oscGain = ctx.createGain();
		oscGain.gain.value = 0.12;
		const gain = ctx.createGain();
		envelope(gain.gain, [[0, 0], [1.45, 0.8], [1.6, 0]]);
		src.connect(band).connect(gain);
		osc.connect(oscGain).connect(gain);
		gain.connect(out);
		src.start();
		osc.start();
		osc.stop(1.6);
	}
}

export async function renderSfx(kind: SfxKind): Promise<AudioBuffer> {
	const ctx = new OfflineAudioContext(
		1,
		Math.ceil(DURATIONS[kind] * SAMPLE_RATE),
		SAMPLE_RATE,
	);
	build(kind, ctx);
	return ctx.startRendering();
}

/** 16-bit PCM WAV, so every browser and the export pipeline can decode it. */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
	const channels = buffer.numberOfChannels;
	const length = buffer.length * channels * 2;
	const view = new DataView(new ArrayBuffer(44 + length));
	const write = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
	};
	write(0, "RIFF");
	view.setUint32(4, 36 + length, true);
	write(8, "WAVE");
	write(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, buffer.sampleRate, true);
	view.setUint32(28, buffer.sampleRate * channels * 2, true);
	view.setUint16(32, channels * 2, true);
	view.setUint16(34, 16, true);
	write(36, "data");
	view.setUint32(40, length, true);

	let offset = 44;
	const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
	for (let i = 0; i < buffer.length; i++) {
		for (let c = 0; c < channels; c++) {
			const sample = Math.max(-1, Math.min(1, data[c][i]));
			view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
			offset += 2;
		}
	}
	return new Blob([view], { type: "audio/wav" });
}
