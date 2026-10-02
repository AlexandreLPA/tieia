/**
 * Pitch-preserving time stretch (WSOLA). Short Hann-windowed grains are read
 * from the source at the clip's speed and overlap-added at a fixed rate, each
 * one nudged (within a few ms) to the spot whose waveform best continues the
 * previous grain. Speed changes duration; pitch stays where it was.
 */

const GRAIN_SECONDS = 0.04;
const SEARCH_SECONDS = 0.01;
// The coarse search compares every 8th sample at 4-sample offsets, then
// refines around the winner; keeps a full 4x clip well under a second
const COARSE_STEP = 4;
const COARSE_DECIMATION = 8;
const FINE_RADIUS = 3;
const FINE_DECIMATION = 2;

function correlate(
	signal: Float32Array,
	a: number,
	b: number,
	length: number,
	decimation: number,
): number {
	let sum = 0;
	for (let i = 0; i < length; i += decimation) {
		sum += (signal[a + i] ?? 0) * (signal[b + i] ?? 0);
	}
	return sum;
}

export function timeStretch({
	channels,
	sourceStart,
	outputLength,
	sampleRate,
	rateAt,
}: {
	/** Source samples per channel, all the same length */
	channels: Float32Array[];
	/** Source sample where the output begins */
	sourceStart: number;
	outputLength: number;
	sampleRate: number;
	/** Speed at a given output sample (2 = twice as fast) */
	rateAt: (outputSample: number) => number;
}): Float32Array[] {
	const grain = Math.max(64, Math.round(sampleRate * GRAIN_SECONDS) & ~1);
	const hop = grain / 2;
	const search = Math.round(sampleRate * SEARCH_SECONDS);
	const sourceLength = channels[0]?.length ?? 0;

	// Periodic Hann at 50% overlap sums to exactly 1
	const window = new Float32Array(grain);
	for (let i = 0; i < grain; i++) {
		window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / grain);
	}

	// Alignment only needs one signal; mixing the channels is enough
	const guide = new Float32Array(sourceLength);
	for (const channel of channels) {
		for (let i = 0; i < sourceLength; i++) guide[i] += channel[i];
	}

	const outputs = channels.map(() => new Float32Array(outputLength + grain));

	// Start one hop early so the first real samples already get full gain
	let outputPosition = -hop;
	let ideal = sourceStart - hop * rateAt(0);
	let previous = -1;

	while (outputPosition < outputLength) {
		let best = Math.round(ideal);
		if (previous >= 0) {
			// Where the last grain would naturally have continued
			const continuation = previous + hop;
			let bestScore = -Infinity;
			const center = best;
			for (let offset = -search; offset <= search; offset += COARSE_STEP) {
				const candidate = center + offset;
				const score = correlate(
					guide,
					candidate,
					continuation,
					grain,
					COARSE_DECIMATION,
				);
				if (score > bestScore) {
					bestScore = score;
					best = candidate;
				}
			}
			const coarse = best;
			for (let offset = -FINE_RADIUS; offset <= FINE_RADIUS; offset++) {
				const candidate = coarse + offset;
				const score = correlate(
					guide,
					candidate,
					continuation,
					grain,
					FINE_DECIMATION,
				);
				if (score > bestScore) {
					bestScore = score;
					best = candidate;
				}
			}
		}

		for (let c = 0; c < channels.length; c++) {
			const source = channels[c];
			const output = outputs[c];
			for (let i = 0; i < grain; i++) {
				const out = outputPosition + i;
				const index = best + i;
				if (out < 0 || index < 0 || index >= sourceLength) continue;
				output[out] += source[index] * window[i];
			}
		}

		previous = best;
		const rate = Math.max(0.01, rateAt(Math.max(0, outputPosition)));
		ideal += hop * rate;
		outputPosition += hop;
	}

	return outputs.map((output) => output.subarray(0, outputLength));
}
