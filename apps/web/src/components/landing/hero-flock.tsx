"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import MurmurationWordmark from "@/components/ui/murmuration-wordmark";

const HEIGHT = "clamp(17rem, 30vw, 25rem)";
// The tiê-sangue is a red bird: the brand red on the light page, a lighter
// one that still reads on the dark page
const TIE_RED = "#d2021b";
const TIE_RED_DARK = "#ff4658";

interface Sky {
	/** Where the drawing area starts, from this column's top left */
	left: number;
	top: number;
	width: number;
	height: number;
}

/**
 * The free space around the column: from the end of the text to the edge of
 * the window, and from the top to the bottom of the hero. The page has one
 * colour there, so the edges of the area are never seen.
 */
function measure(column: HTMLElement): Sky | null {
	const section = column.closest("section");
	if (!section) return null;
	const col = column.getBoundingClientRect();
	const box = section.getBoundingClientRect();
	const viewport = document.documentElement.clientWidth;
	// One column (phones): the text is above, so the birds stay below it
	const stacked = col.width > viewport * 0.7;
	// Out to the window's left edge too: the birds may pass behind the text,
	// which stays on top, so no edge is ever near the flock
	const left = col.left;
	const top = stacked ? 40 : col.top - box.top;
	const right = Math.max(0, viewport - col.right);
	const bottom = Math.max(0, box.bottom - col.bottom);
	return {
		left: Math.floor(left),
		top: Math.floor(top),
		width: Math.floor(left + col.width + right) - 1,
		height: Math.floor(top + col.height + bottom),
	};
}

/**
 * The hero's picture: a flock of red birds, straight over the page, that
 * gathers into "Tiê AI" and into the bird of the icon in this column, and
 * flies free over all the empty space around it in between. Until it is
 * measured the space stays empty, at its final height, so nothing jumps.
 */
export function HeroFlock() {
	const { resolvedTheme } = useTheme();
	const columnRef = useRef<HTMLDivElement>(null);
	// Measured in the browser, which is also where the theme is known
	const [sky, setSky] = useState<Sky | null>(null);

	useEffect(() => {
		const column = columnRef.current;
		if (!column) return;
		const update = () => {
			const next = measure(column);
			setSky((current) =>
				current &&
				next &&
				current.left === next.left &&
				current.top === next.top &&
				current.width === next.width &&
				current.height === next.height
					? current
					: next,
			);
		};
		update();
		const observer = new ResizeObserver(update);
		const section = column.closest("section");
		if (section) observer.observe(section);
		window.addEventListener("resize", update);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", update);
		};
	}, []);

	return (
		<div ref={columnRef} className="relative" style={{ height: HEIGHT }}>
			{sky ? (
				<div
					className="absolute"
					style={{
						left: -sky.left,
						top: -sky.top,
						width: sky.width,
						height: sky.height,
					}}
				>
					<MurmurationWordmark
						word="Tiê AI"
						image="/brand/tie-line.png"
						startWithImage
						transparent
						contain
						reeds={false}
						birds={9000}
						// 7 s from one shape to the next: 1.5 s flying free, 2.4 s
						// forming, 2.5 s held, 0.6 s letting go
						flyFor={1.5}
						holdFor={2.5}
						roam={0.3}
						focus={{
							x: sky.left,
							y: sky.top,
							width: columnRef.current?.clientWidth ?? sky.width,
							height: columnRef.current?.clientHeight ?? sky.height,
						}}
						palette={{
							ink: resolvedTheme === "dark" ? TIE_RED_DARK : TIE_RED,
						}}
						fontFamily="var(--font-archivo), Arial, sans-serif"
						height={`${sky.height}px`}
					/>
				</div>
			) : null}
		</div>
	);
}
