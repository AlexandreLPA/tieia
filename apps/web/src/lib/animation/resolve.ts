import type {
	AnimationPropertyPath,
	ElementAnimations,
} from "@/types/animation";
import type { Transform } from "@/types/timeline";
import {
	getColorValueAtTime,
	getNumberChannelValueAtTime,
} from "./interpolation";
import { getColorChannelForPath } from "./color-channel";
import { getNumberChannelForPath } from "./number-channel";
import { type ElementFade, getFadeMultiplier } from "./fade";

export function getElementLocalTime({
	timelineTime,
	elementStartTime,
	elementDuration,
}: {
	timelineTime: number;
	elementStartTime: number;
	elementDuration: number;
}): number {
	const localTime = timelineTime - elementStartTime;
	if (localTime <= 0) {
		return 0;
	}

	if (localTime >= elementDuration) {
		return elementDuration;
	}

	return localTime;
}

export function resolveTransformAtTime({
	baseTransform,
	animations,
	localTime,
}: {
	baseTransform: Transform;
	animations: ElementAnimations | undefined;
	localTime: number;
}): Transform {
	const safeLocalTime = Math.max(0, localTime);
	return {
		// Flips are not animatable, so they come straight from the element
		...baseTransform,
		position: {
			x: getNumberChannelValueAtTime({
				channel: getNumberChannelForPath({
					animations,
					propertyPath: "transform.position.x",
				}),
				time: safeLocalTime,
				fallbackValue: baseTransform.position.x,
			}),
			y: getNumberChannelValueAtTime({
				channel: getNumberChannelForPath({
					animations,
					propertyPath: "transform.position.y",
				}),
				time: safeLocalTime,
				fallbackValue: baseTransform.position.y,
			}),
		},
		scale: getNumberChannelValueAtTime({
			channel: getNumberChannelForPath({
				animations,
				propertyPath: "transform.scale",
			}),
			time: safeLocalTime,
			fallbackValue: baseTransform.scale,
		}),
		rotate: getNumberChannelValueAtTime({
			channel: getNumberChannelForPath({
				animations,
				propertyPath: "transform.rotate",
			}),
			time: safeLocalTime,
			fallbackValue: baseTransform.rotate,
		}),
	};
}

/**
 * With `fade`, the opacity the viewer sees, fade in/out included. Without it,
 * the opacity property itself, which is what the properties panel edits.
 */
export function resolveOpacityAtTime({
	baseOpacity,
	animations,
	localTime,
	fade,
}: {
	baseOpacity: number;
	animations: ElementAnimations | undefined;
	localTime: number;
	fade?: ElementFade;
}): number {
	const safeLocalTime = Math.max(0, localTime);
	const opacity = getNumberChannelValueAtTime({
		channel: getNumberChannelForPath({
			animations,
			propertyPath: "opacity",
		}),
		time: safeLocalTime,
		fallbackValue: baseOpacity,
	});
	if (!fade) return opacity;
	return opacity * getFadeMultiplier({ ...fade, localTime: safeLocalTime });
}

export function resolveNumberAtTime({
	baseValue,
	animations,
	propertyPath,
	localTime,
}: {
	baseValue: number;
	animations: ElementAnimations | undefined;
	propertyPath: AnimationPropertyPath;
	localTime: number;
}): number {
	return getNumberChannelValueAtTime({
		channel: getNumberChannelForPath({ animations, propertyPath }),
		time: Math.max(0, localTime),
		fallbackValue: baseValue,
	});
}

export function resolveColorAtTime({
	baseColor,
	animations,
	propertyPath,
	localTime,
}: {
	baseColor: string;
	animations: ElementAnimations | undefined;
	propertyPath: AnimationPropertyPath;
	localTime: number;
}): string {
	return getColorValueAtTime({
		channel: getColorChannelForPath({ animations, propertyPath }),
		time: Math.max(0, localTime),
		fallbackValue: baseColor,
	});
}

export function resolveVolumeAtTime({
	baseVolume,
	animations,
	localTime,
}: {
	baseVolume: number;
	animations: ElementAnimations | undefined;
	localTime: number;
}): number {
	return getNumberChannelValueAtTime({
		channel: getNumberChannelForPath({
			animations,
			propertyPath: "volume",
		}),
		time: Math.max(0, localTime),
		fallbackValue: baseVolume,
	});
}

export function resolvePlaybackRateAtTime({
	basePlaybackRate,
	animations,
	localTime,
}: {
	basePlaybackRate: number;
	animations: ElementAnimations | undefined;
	localTime: number;
}): number {
	return getNumberChannelValueAtTime({
		channel: getNumberChannelForPath({
			animations,
			propertyPath: "playbackRate",
		}),
		time: Math.max(0, localTime),
		fallbackValue: basePlaybackRate,
	});
}
