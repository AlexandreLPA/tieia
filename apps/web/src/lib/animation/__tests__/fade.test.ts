import { describe, expect, test } from "bun:test";
import {
	getEffectiveFades,
	getFadeEnvelope,
	getFadeMultiplier,
	getMaxFadeDuration,
	resolveOpacityAtTime,
} from "@/lib/animation";
import { applyFade } from "@/lib/media/audio";

describe("fade lengths", () => {
	test("each fade goes up to half the clip", () => {
		expect(getMaxFadeDuration({ duration: 6 })).toBe(3);
		expect(getEffectiveFades({ duration: 6, fadeIn: 5, fadeOut: 1 })).toEqual({
			fadeIn: 3,
			fadeOut: 1,
		});
	});

	test("unset, zero and negative mean no fade", () => {
		expect(getEffectiveFades({ duration: 4 })).toEqual({
			fadeIn: 0,
			fadeOut: 0,
		});
		expect(getEffectiveFades({ duration: 4, fadeIn: 0, fadeOut: -1 })).toEqual({
			fadeIn: 0,
			fadeOut: 0,
		});
	});

	test("a clip trimmed after the fade was set keeps it within half", () => {
		expect(getEffectiveFades({ duration: 1, fadeIn: 2 }).fadeIn).toBe(0.5);
	});
});

describe("fade curve", () => {
	const fade = { duration: 4, fadeIn: 1, fadeOut: 2 };

	test("rises over the fade in and falls over the fade out", () => {
		const at = (localTime: number) => getFadeMultiplier({ ...fade, localTime });
		expect(at(0)).toBe(0);
		expect(at(0.5)).toBe(0.5);
		expect(at(1)).toBe(1);
		expect(at(2)).toBe(1);
		expect(at(3)).toBe(0.5);
		expect(at(4)).toBe(0);
	});

	test("without fades the clip stays whole", () => {
		expect(getFadeMultiplier({ duration: 4, localTime: 0 })).toBe(1);
		expect(getFadeMultiplier({ duration: 4, localTime: 4 })).toBe(1);
	});

	test("the visible opacity includes the fade, the property itself doesn't", () => {
		const base = { baseOpacity: 0.8, animations: undefined, localTime: 0.5 };
		expect(resolveOpacityAtTime({ ...base, fade })).toBeCloseTo(0.4);
		expect(resolveOpacityAtTime(base)).toBe(0.8);
	});

	test("the envelope bends exactly where the curve does", () => {
		expect(getFadeEnvelope({ ...fade, from: 0, to: 4 })).toEqual([
			{ time: 0, value: 0 },
			{ time: 1, value: 1 },
			{ time: 2, value: 1 },
			{ time: 4, value: 0 },
		]);
		expect(getFadeEnvelope({ ...fade, from: 0.5, to: 1.5 })).toEqual([
			{ time: 0.5, value: 0.5 },
			{ time: 1, value: 1 },
			{ time: 1.5, value: 1 },
		]);
	});
});

describe("exported audio", () => {
	function buildBuffer({ length }: { length: number }) {
		const channels = [new Float32Array(length), new Float32Array(length)];
		for (const data of channels) data.fill(1);
		return {
			channels,
			buffer: {
				length,
				numberOfChannels: channels.length,
				getChannelData: (channel: number) => channels[channel],
			} as unknown as AudioBuffer,
		};
	}

	test("samples follow the same curve as the picture", () => {
		const sampleRate = 10;
		const fade = { duration: 2, fadeIn: 0.5, fadeOut: 1 };
		const { channels, buffer } = buildBuffer({ length: 20 });

		applyFade({ output: buffer, sampleRate, fade });

		for (const data of channels) {
			for (let i = 0; i < data.length; i++) {
				expect(data[i]).toBeCloseTo(
					getFadeMultiplier({ ...fade, localTime: i / sampleRate }),
				);
			}
		}
		expect(channels[0][0]).toBe(0);
		expect(channels[1][10]).toBe(1);
		expect(channels[0][15]).toBeCloseTo(0.5);
	});

	test("a clip without fades is left untouched", () => {
		const { channels, buffer } = buildBuffer({ length: 20 });
		applyFade({ output: buffer, sampleRate: 10, fade: { duration: 2 } });
		expect(channels[0].every((sample) => sample === 1)).toBe(true);
	});
});
