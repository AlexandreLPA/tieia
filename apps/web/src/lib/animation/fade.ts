import { clamp } from "@/utils/math";

/** Each fade can take up to half the clip, so fade in and fade out never overlap */
export const MAX_FADE_RATIO = 0.5;

export interface ElementFade {
	duration: number;
	fadeIn?: number;
	fadeOut?: number;
}

export function getMaxFadeDuration({ duration }: { duration: number }): number {
	return Math.max(0, duration) * MAX_FADE_RATIO;
}

function clampFade({ value, max }: { value?: number; max: number }): number {
	if (value === undefined || !Number.isFinite(value) || value <= 0) return 0;
	return Math.min(value, max);
}

/**
 * Fade lengths as they play. A clip trimmed shorter after its fade was set
 * keeps each fade within half of what is left.
 */
export function getEffectiveFades({ duration, fadeIn, fadeOut }: ElementFade): {
	fadeIn: number;
	fadeOut: number;
} {
	const max = getMaxFadeDuration({ duration });
	return {
		fadeIn: clampFade({ value: fadeIn, max }),
		fadeOut: clampFade({ value: fadeOut, max }),
	};
}

export function hasFade(fade: ElementFade): boolean {
	const { fadeIn, fadeOut } = getEffectiveFades(fade);
	return fadeIn > 0 || fadeOut > 0;
}

/**
 * How much of the clip shows (or sounds) at a time measured from the clip's
 * start: 0 at the very start of a fade in and the very end of a fade out,
 * 1 between the fades. Linear, for both picture and sound.
 */
export function getFadeMultiplier({
	localTime,
	...fade
}: ElementFade & { localTime: number }): number {
	const { fadeIn, fadeOut } = getEffectiveFades(fade);
	let multiplier = 1;
	if (fadeIn > 0) multiplier = Math.min(multiplier, localTime / fadeIn);
	if (fadeOut > 0) {
		multiplier = Math.min(multiplier, (fade.duration - localTime) / fadeOut);
	}
	return clamp({ value: multiplier, min: 0, max: 1 });
}

/**
 * The fade over part of a clip, as points to ramp a gain between. The curve
 * is straight between them, so linear ramps through these points reproduce
 * getFadeMultiplier exactly.
 */
export function getFadeEnvelope({
	from,
	to,
	...fade
}: ElementFade & { from: number; to: number }): Array<{
	time: number;
	value: number;
}> {
	const { fadeIn, fadeOut } = getEffectiveFades(fade);
	const bends = [fadeIn, fade.duration - fadeOut].filter(
		(time) => time > from && time < to,
	);
	return [from, ...bends, to].map((time) => ({
		time,
		value: getFadeMultiplier({ ...fade, localTime: time }),
	}));
}
