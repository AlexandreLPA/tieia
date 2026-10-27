/**
 * Loudness of the exported mix, measured like ffmpeg's loudnorm and the
 * platforms do (ITU-R BS.1770: K-weighting, 400 ms blocks, gating), and a
 * gain that brings it to the target. TikTok, Reels and YouTube play videos
 * around -14 LUFS, so a quiet export sounds weak next to the others.
 */

/** Integrated loudness the platforms normalize to */
export const EXPORT_TARGET_LUFS = -14;
/** Highest peak allowed after the gain (dBFS) */
const PEAK_CEILING_DB = -1;
/** Sample peaks miss what happens between samples; keep a little extra room */
const INTER_SAMPLE_MARGIN_DB = 0.5;
/** Quieter than this is ambience or silence: raising it would only add noise */
const MIN_MEASURABLE_LUFS = -50;

const BLOCK_SECONDS = 0.4;
const HOP_SECONDS = 0.1;
const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_LU = -10;

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

// BS.1770 filter coefficients for any sample rate (same as libebur128)
function getKWeightingFilters(sampleRate: number): [Biquad, Biquad] {
	const shelfK = Math.tan((Math.PI * 1681.974450955533) / sampleRate);
	const shelfQ = 0.7071752369554196;
	const vh = 10 ** (3.999843853973347 / 20);
	const vb = vh ** 0.4996667741545416;
	const shelfA0 = 1 + shelfK / shelfQ + shelfK * shelfK;
	const shelf = {
		b0: (vh + (vb * shelfK) / shelfQ + shelfK * shelfK) / shelfA0,
		b1: (2 * (shelfK * shelfK - vh)) / shelfA0,
		b2: (vh - (vb * shelfK) / shelfQ + shelfK * shelfK) / shelfA0,
		a1: (2 * (shelfK * shelfK - 1)) / shelfA0,
		a2: (1 - shelfK / shelfQ + shelfK * shelfK) / shelfA0,
	};

	const passK = Math.tan((Math.PI * 38.13547087602444) / sampleRate);
	const passQ = 0.5003270373238773;
	const passA0 = 1 + passK / passQ + passK * passK;
	const highPass = {
		b0: 1,
		b1: -2,
		b2: 1,
		a1: (2 * (passK * passK - 1)) / passA0,
		a2: (1 - passK / passQ + passK * passK) / passA0,
	};

	return [shelf, highPass];
}

function applyBiquad(input: Float32Array, { b0, b1, b2, a1, a2 }: Biquad): Float32Array {
	const output = new Float32Array(input.length);
	let x1 = 0;
	let x2 = 0;
	let y1 = 0;
	let y2 = 0;
	for (let i = 0; i < input.length; i++) {
		const x = input[i];
		const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
		output[i] = y;
		x2 = x1;
		x1 = x;
		y2 = y1;
		y1 = y;
	}
	return output;
}

function energyToLufs(energy: number): number {
	return -0.691 + 10 * Math.log10(energy);
}

/** Integrated loudness in LUFS; -Infinity when there is nothing to measure */
export function measureIntegratedLoudness(buffer: AudioBuffer): number {
	const filters = getKWeightingFilters(buffer.sampleRate);
	const weighted: Float32Array[] = [];
	for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
		let samples = buffer.getChannelData(channel);
		for (const filter of filters) samples = applyBiquad(samples, filter);
		weighted.push(samples);
	}

	const blockLength = Math.round(BLOCK_SECONDS * buffer.sampleRate);
	const hop = Math.round(HOP_SECONDS * buffer.sampleRate);
	const blockEnergies: number[] = [];
	for (let start = 0; start + blockLength <= buffer.length; start += hop) {
		let energy = 0;
		for (const samples of weighted) {
			let sum = 0;
			for (let i = start; i < start + blockLength; i++) sum += samples[i] * samples[i];
			energy += sum / blockLength;
		}
		blockEnergies.push(energy);
	}

	const aboveAbsolute = blockEnergies.filter(
		(energy) => energyToLufs(energy) > ABSOLUTE_GATE_LUFS,
	);
	if (aboveAbsolute.length === 0) return Number.NEGATIVE_INFINITY;

	const mean = (values: number[]) =>
		values.reduce((sum, value) => sum + value, 0) / values.length;
	const relativeGate = energyToLufs(mean(aboveAbsolute)) + RELATIVE_GATE_LU;
	const gated = aboveAbsolute.filter((energy) => energyToLufs(energy) > relativeGate);
	return energyToLufs(mean(gated));
}

/** Never raise more than this: past it the noise floor comes up too */
const MAX_GAIN_DB = 20;
const LIMITER_LOOKAHEAD_SECONDS = 0.005;
const LIMITER_RELEASE_SECONDS = 0.08;

/**
 * Gain per sample that keeps every peak under `ceiling` (linear). It starts
 * turning down a few milliseconds before a peak and comes back up smoothly,
 * so only the loud moments get touched and nothing clicks.
 */
function getLimiterGains(
	channels: Float32Array[],
	gain: number,
	ceiling: number,
	sampleRate: number,
): Float32Array {
	const length = channels[0]?.length ?? 0;
	const needed = new Float32Array(length);
	for (let i = 0; i < length; i++) {
		let peak = 0;
		for (const samples of channels) {
			const value = Math.abs(samples[i] * gain);
			if (value > peak) peak = value;
		}
		needed[i] = peak > ceiling ? ceiling / peak : 1;
	}

	// Lowest need over the next `window` samples (sliding minimum)
	const window = Math.max(1, Math.round(LIMITER_LOOKAHEAD_SECONDS * sampleRate));
	const ahead = new Float32Array(length);
	const queue = new Int32Array(length);
	let head = 0;
	let tail = 0;
	for (let i = length - 1; i >= 0; i--) {
		while (tail > head && needed[queue[tail - 1]] >= needed[i]) tail--;
		queue[tail++] = i;
		while (queue[head] > i + window - 1) head++;
		ahead[i] = needed[queue[head]];
	}

	// Averaging over the same window ramps the gain down instead of stepping,
	// and still lands at or under what each peak needs
	const gains = new Float32Array(length);
	const recovery = 1 - Math.exp(-1 / (LIMITER_RELEASE_SECONDS * sampleRate));
	let sum = 0;
	let previous = 1;
	for (let i = 0; i < length; i++) {
		sum += ahead[i];
		if (i >= window) sum -= ahead[i - window];
		const smoothed = sum / Math.min(i + 1, window);
		previous = Math.min(smoothed, previous + (1 - previous) * recovery);
		gains[i] = previous;
	}
	return gains;
}

/**
 * Brings the mix to the target loudness, in place. Peaks that the gain would
 * push past the ceiling are held down by the limiter. Returns the gain
 * applied in dB (0 when the mix was left as is).
 */
export function normalizeLoudness(
	buffer: AudioBuffer,
	targetLufs: number = EXPORT_TARGET_LUFS,
): number {
	const loudness = measureIntegratedLoudness(buffer);
	if (!Number.isFinite(loudness) || loudness < MIN_MEASURABLE_LUFS) return 0;

	const gainDb = Math.min(targetLufs - loudness, MAX_GAIN_DB);
	if (Math.abs(gainDb) < 0.1) return 0;

	const gain = 10 ** (gainDb / 20);
	const ceiling = 10 ** ((PEAK_CEILING_DB - INTER_SAMPLE_MARGIN_DB) / 20);
	const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
		buffer.getChannelData(channel),
	);
	const limiter = getLimiterGains(channels, gain, ceiling, buffer.sampleRate);
	for (const samples of channels) {
		for (let i = 0; i < samples.length; i++) samples[i] *= gain * limiter[i];
	}
	return gainDb;
}
