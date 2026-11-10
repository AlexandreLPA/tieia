"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import MurmurationWordmark, {
	MURMURATION_PRESETS,
} from "@/components/ui/murmuration-wordmark";

const HEIGHT = "clamp(20rem, 54svh, 34rem)";
// The tiê-sangue is a red bird: the brand red by day, a lighter one that
// still reads against the night sky.
const TIE_RED = "#d2021b";
const TIE_RED_NIGHT = "#ff4658";

/**
 * Opens the landing page: a flock that gathers into "Tiê AI" and scatters
 * again. Red birds, as the tiê-sangue is; a dawn sky on the light theme and
 * a night sky on the dark one.
 */
export function FlockBanner() {
	const { resolvedTheme } = useTheme();
	// The theme is only known in the browser; until then the section shows
	// the sky colour of each theme, so nothing flashes.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	const isDark = resolvedTheme === "dark";

	return (
		<section
			className="border-b bg-(--flock-sky) dark:bg-(--flock-sky-dark)"
			style={
				{
					height: HEIGHT,
					"--flock-sky": MURMURATION_PRESETS.dawn.skyTop,
					"--flock-sky-dark": MURMURATION_PRESETS.night.skyTop,
				} as CSSProperties
			}
		>
			{mounted && (
				<MurmurationWordmark
					word="Tiê AI"
					preset={isDark ? "night" : "dawn"}
					palette={
						isDark
							? { ink: TIE_RED_NIGHT, reed: MURMURATION_PRESETS.night.ink }
							: { ink: TIE_RED, reed: MURMURATION_PRESETS.dawn.ink }
					}
					fontFamily="var(--font-archivo), Arial, sans-serif"
					height={HEIGHT}
				/>
			)}
		</section>
	);
}
