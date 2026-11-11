"use client";

// Murmuration Wordmark (from 21st.dev, adapted): thousands of birds over a
// sky. The flock rolls and folds the way a real murmuration does, driven by a
// slow curl-noise current and a wandering centre of gravity; every few seconds
// it converges, bird by bird, into the word, holds it, and scatters again. The
// pointer is a hawk: the flock tears open around it and closes behind.
//
// A 2D canvas for the sky, the birds and the reeds; every bird is two strokes
// batched into a single path per frame. Nothing is fetched.
//
// Changes from the original: `fontFamily` accepts a CSS variable (the brand
// font comes from next/font), and with reduced motion the birds rest on the
// word instead of on a shapeless cloud.

import * as React from "react";

export interface MurmurationPalette {
	/** Sky at the top. */
	skyTop: string;
	/** Sky at the horizon. */
	skyLow: string;
	/** The sun's glow. */
	sun: string;
	/** Birds and, unless `reed` is set, the reed line. */
	ink: string;
	/** The reed line, when it should differ from the birds. */
	reed?: string;
}

export type MurmurationPreset = "dusk" | "dawn" | "paper" | "night";

export interface MurmurationWordmarkProps {
	/** The word the flock forms. Short and bold reads best. */
	word?: string;
	/** How many birds. Scaled down on small screens. Defaults to 4200. */
	birds?: number;
	/** Sky and ink. Defaults to "dusk". */
	preset?: MurmurationPreset;
	/** Colour overrides, merged over the preset. */
	palette?: Partial<MurmurationPalette>;
	/** Seconds the flock flies free between formations. Defaults to 7. */
	flyFor?: number;
	/** Seconds the word holds once formed. Defaults to 3.2. */
	holdFor?: number;
	/** Show the reed line along the bottom. Defaults to true. */
	reeds?: boolean;
	/** The pointer is a hawk the flock flees. Defaults to true. */
	interactive?: boolean;
	/**
	 * An image whose opaque pixels the flock also forms, taking turns with the
	 * word (a logo, a symbol).
	 */
	image?: string;
	/**
	 * How far the free flock wanders from the middle: 1 crosses the whole
	 * width, less keeps it inside a small box. Defaults to 1.
	 */
	roam?: number;
	/**
	 * Keeps every bird inside the element: they turn back near the edges
	 * instead of flying off and being cut. Defaults to false.
	 */
	contain?: boolean;
	/**
	 * Where the word and the image are formed, and the middle of free flight,
	 * in pixels from the element's top left. Defaults to the whole element; a
	 * smaller one lets the flock roam a wide area around a picture.
	 */
	focus?: { x: number; y: number; width: number; height: number };
	/**
	 * Opens with the birds already holding the image, which then takes turns
	 * with the word. Needs `image`. Defaults to false.
	 */
	startWithImage?: boolean;
	/** No sky and no reeds: only the birds, over whatever is behind. */
	transparent?: boolean;
	/** Face the word is sampled from; `var(--x)` is resolved on the element. */
	fontFamily?: string;
	/** Content laid over the sky (a headline, a nav). */
	children?: React.ReactNode;
	/** Root height. A definite length, never a percentage. */
	height?: string;
	className?: string;
}

export const MURMURATION_PRESETS: Record<
	MurmurationPreset,
	MurmurationPalette
> = {
	dusk: {
		skyTop: "#1d2b44",
		skyLow: "#e89a6a",
		sun: "#ffd2a0",
		ink: "#14100f",
	},
	dawn: {
		skyTop: "#9fb4c9",
		skyLow: "#f3d6c2",
		sun: "#fff3df",
		ink: "#1f2329",
	},
	paper: {
		skyTop: "#efe9dd",
		skyLow: "#e6ddcc",
		sun: "#ffffff",
		ink: "#1a1714",
	},
	night: {
		skyTop: "#05070d",
		skyLow: "#1a2236",
		sun: "#4a5d86",
		ink: "#dfe6f5",
	},
};

const SANS_STACK =
	'"Inter Tight", "Inter", "Helvetica Neue", Arial, system-ui, sans-serif';

/** Small seeded PRNG (mulberry32). */
export function mmwRandom(seed: number) {
	let a = seed >>> 0 || 1;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Divergence-free current at (x, y) in unit space at time t: the curl of a
 * sum of travelling waves. Returns [vx, vy]. Being a curl, it never piles
 * birds into a point or tears holes in the flock; it only folds it.
 */
export function mmwCurl(x: number, y: number, t: number) {
	const a = 1.7 * x + t;
	const b = 1.3 * y - 0.6 * t;
	const c = 2.9 * y + 1.1 * x - 0.8 * t;
	const d = 4.3 * x - 3.7 * y + 1.3 * t;
	const dpdx =
		1.7 * Math.cos(a) * Math.cos(b) +
		0.6 * 1.1 * Math.cos(c) -
		0.35 * 4.3 * Math.sin(d);
	const dpdy =
		-1.3 * Math.sin(a) * Math.sin(b) +
		0.6 * 2.9 * Math.cos(c) +
		0.35 * 3.7 * Math.sin(d);
	return [dpdy, -dpdx];
}

/** The flock's wandering centre in unit space ([-1, 1] across the width). */
export function mmwCentre(t: number) {
	return [
		0.42 * Math.sin(t * 0.21) + 0.12 * Math.sin(t * 0.53 + 1),
		0.16 * Math.sin(t * 0.33 + 2) - 0.08,
	];
}

/** Smoothstep. */
export function mmwEase(k: number) {
	const x = k < 0 ? 0 : k > 1 ? 1 : k;
	return x * x * (3 - 2 * x);
}

/**
 * Pair every bird with a target point. Targets are reused round-robin when
 * there are fewer points than birds, and the pairing is shuffled so the word
 * fills in from everywhere at once rather than letter by letter.
 */
export function mmwAssign(birds: number, points: number, seed: number) {
	const out = new Int32Array(birds);
	if (points <= 0) return out.fill(-1);
	const order = new Int32Array(points);
	for (let i = 0; i < points; i++) order[i] = i;
	const rand = mmwRandom(seed);
	for (let i = points - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		const tmp = order[i];
		order[i] = order[j];
		order[j] = tmp;
	}
	for (let i = 0; i < birds; i++) out[i] = order[i % points];
	return out;
}

/** A colour at an alpha, for #rgb / #rrggbb; anything else is returned as-is. */
export function mmwAlpha(hex: string, alpha: number) {
	const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || "").trim());
	if (!m) return hex;
	const h =
		m[1].length === 3
			? m[1]
					.split("")
					.map((c) => c + c)
					.join("")
			: m[1];
	return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${alpha})`;
}

/** Replaces each `var(--name)` with its value on the element. */
function resolveFontFamily(element: Element, fontFamily: string) {
	if (!fontFamily.includes("var(")) return fontFamily;
	const style = getComputedStyle(element);
	return fontFamily.replace(
		/var\(\s*(--[\w-]+)\s*\)/g,
		(_, name: string) => style.getPropertyValue(name).trim() || "sans-serif",
	);
}

const MMW_CSS = `
.mmw-root { position: relative; width: 100%; overflow: hidden; isolation: isolate; background: var(--mmw-sky); }
.mmw-root canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; max-width: none; }
.mmw-over { position: relative; z-index: 1; height: 100%; pointer-events: none; }
.mmw-over [data-interactive], .mmw-over a, .mmw-over button { pointer-events: auto; }
`;

export default function MurmurationWordmark({
	word = "flock",
	birds = 4200,
	preset = "dusk",
	palette,
	flyFor = 7,
	holdFor = 3.2,
	reeds = true,
	interactive = true,
	image,
	transparent = false,
	roam = 1,
	contain = false,
	startWithImage = false,
	focus,
	fontFamily = SANS_STACK,
	children,
	height = "100svh",
	className = "",
}: MurmurationWordmarkProps) {
	const colors = {
		...(MURMURATION_PRESETS[preset] || MURMURATION_PRESETS.dusk),
		...(palette || {}),
	};
	const rootRef = React.useRef<HTMLDivElement | null>(null);
	const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
	const opts = React.useRef({ flyFor, holdFor, interactive, roam, contain });
	opts.current = { flyFor, holdFor, interactive, roam, contain };
	const { skyTop, skyLow, sun: sunColor, ink } = colors;
	const reedColor = colors.reed ?? ink;
	// The birds' colour is read on every frame: a new theme repaints the flock
	// where it is instead of starting the animation over
	const inkRef = React.useRef(ink);
	inkRef.current = ink;
	// Only the sky's own colours redraw it from scratch
	const skyReed = transparent || !reeds ? "" : reedColor;
	const focusX = focus?.x;
	const focusY = focus?.y;
	const focusW = focus?.width;
	const focusH = focus?.height;

	React.useEffect(() => {
		const root = rootRef.current;
		const canvas = canvasRef.current;
		if (!root || !canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const reduced = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;

		let w = 1;
		let h = 1;
		let dpr = 1;
		let n = 0;
		let raf = 0;
		let visible = true;
		let sky: HTMLCanvasElement | null = null;
		// Per bird: position, velocity (px), depth, wing phase, target index.
		let px = new Float32Array(0);
		let py = new Float32Array(0);
		let vx = new Float32Array(0);
		let vy = new Float32Array(0);
		let depth = new Float32Array(0);
		let phase = new Float32Array(0);
		// What the flock forms, in turns: the word, then the image when there is one
		let shapes: {
			tx: Float32Array<ArrayBuffer>;
			ty: Float32Array<ArrayBuffer>;
			target: Int32Array<ArrayBuffer>;
		}[] = [];
		let target = new Int32Array(0);
		let tx = new Float32Array(0);
		let ty = new Float32Array(0);
		let picture: HTMLImageElement | null = null;
		let hx = -1e5;
		let hy = -1e5;
		let last = performance.now();
		let clock = 0;
		// With startWithImage, nothing is drawn until the image is in place
		let started = !(startWithImage && image);
		const rand = mmwRandom(11);
		let fx = 0;
		let fy = 0;
		let fw = 1;
		let fh = 1;

		const layout = () => {
			const rect = root.getBoundingClientRect();
			w = Math.max(1, Math.round(rect.width));
			h = Math.max(1, Math.round(rect.height));
			dpr = Math.min(window.devicePixelRatio || 1, 2);
			fx = Math.max(0, Math.min(w - 1, focusX ?? 0));
			fy = Math.max(0, Math.min(h - 1, focusY ?? 0));
			fw = Math.max(1, Math.min(w - fx, focusW ?? w));
			fh = Math.max(1, Math.min(h - fy, focusH ?? h));
			canvas.width = Math.round(w * dpr);
			canvas.height = Math.round(h * dpr);

			// Sky: a vertical gradient, the sun's glow low on the horizon, grain.
			sky = transparent ? null : document.createElement("canvas");
			if (sky) {
				sky.width = canvas.width;
				sky.height = canvas.height;
			}
			const s = sky?.getContext("2d");
			if (s) {
				s.setTransform(dpr, 0, 0, dpr, 0, 0);
				const g = s.createLinearGradient(0, 0, 0, h);
				g.addColorStop(0, skyTop);
				g.addColorStop(0.78, skyLow);
				g.addColorStop(1, skyLow);
				s.fillStyle = g;
				s.fillRect(0, 0, w, h);
				const glow = s.createRadialGradient(
					w * 0.62,
					h * 0.86,
					0,
					w * 0.62,
					h * 0.86,
					Math.max(w, h) * 0.55,
				);
				glow.addColorStop(0, sunColor);
				glow.addColorStop(0.25, mmwAlpha(sunColor, 0.5));
				glow.addColorStop(1, mmwAlpha(sunColor, 0));
				s.globalAlpha = 0.55;
				s.fillStyle = glow;
				s.fillRect(0, 0, w, h);
				s.globalAlpha = 1;
				const gr = mmwRandom(5);
				for (let i = 0; i < (w * h) / 10; i++) {
					s.fillStyle =
						gr() < 0.5 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.035)";
					s.fillRect(gr() * w, gr() * h, 1, 1);
				}
				if (reeds) {
					// A reed bed along the bottom, stalks leaning with a wind.
					s.strokeStyle = reedColor;
					s.fillStyle = reedColor;
					const base = h - Math.max(6, h * 0.012);
					s.fillRect(0, base, w, h - base);
					for (let x = -10; x < w + 10; x += 2 + gr() * 9) {
						if (gr() < 0.18) x += gr() * 30;
						const tall = gr() ** 1.6 * Math.max(34, h * 0.13) + 6;
						const lean = (gr() - 0.3) * 10;
						s.lineWidth = 0.6 + gr() * 1.2;
						s.beginPath();
						s.moveTo(x, base + 2);
						s.quadraticCurveTo(
							x + lean * 0.3,
							base - tall * 0.6,
							x + lean,
							base - tall,
						);
						s.stroke();
						if (gr() < 0.07) {
							s.beginPath();
							s.ellipse(
								x + lean,
								base - tall - 4,
								1.8,
								6,
								lean * 0.04,
								0,
								Math.PI * 2,
							);
							s.fill();
						}
					}
				}
			}

			// The word, sampled into points on a 1x mask.
			const m = document.createElement("canvas");
			m.width = w;
			m.height = h;
			const mc = m.getContext("2d", { willReadFrequently: true });
			const xs: number[] = [];
			const ys: number[] = [];
			if (mc) {
				const face = resolveFontFamily(root, fontFamily);
				mc.font = `900 100px ${face}`;
				const wordW = mc.measureText(word || " ").width || 1;
				const size = Math.min(((fw * 0.74) / wordW) * 100, (fh * 0.4) / 0.72);
				mc.font = `900 ${size}px ${face}`;
				mc.textAlign = "center";
				mc.textBaseline = "middle";
				mc.fillText(word || " ", fx + fw / 2, fy + fh * 0.44);
				const img = mc.getImageData(0, 0, w, h).data;
				const step = Math.max(2, Math.round(Math.sqrt((w * h) / 90000)));
				for (let y = 0; y < h; y += step) {
					for (let x = 0; x < w; x += step) {
						if (img[(y * w + x) * 4 + 3] > 128) {
							xs.push(x + (rand() - 0.5) * step);
							ys.push(y + (rand() - 0.5) * step);
						}
					}
				}
			}
			const sample = (xs: number[], ys: number[]) => {
				const step = Math.max(2, Math.round(Math.sqrt((w * h) / 90000)));
				const data = mc?.getImageData(0, 0, w, h).data;
				if (!data) return;
				for (let y = 0; y < h; y += step) {
					for (let x = 0; x < w; x += step) {
						if (data[(y * w + x) * 4 + 3] > 128) {
							xs.push(x + (rand() - 0.5) * step);
							ys.push(y + (rand() - 0.5) * step);
						}
					}
				}
			};
			const found = [{ xs, ys }];
			const imageFirst = startWithImage;
			if (mc && picture?.complete && picture.naturalWidth > 0) {
				// The image, contained in the middle of the canvas
				const scale = Math.min(
					(fw * 0.86) / picture.naturalWidth,
					(fh * 0.86) / picture.naturalHeight,
				);
				const pw = picture.naturalWidth * scale;
				const ph = picture.naturalHeight * scale;
				mc.clearRect(0, 0, w, h);
				mc.drawImage(picture, fx + (fw - pw) / 2, fy + (fh - ph) / 2, pw, ph);
				const pxs: number[] = [];
				const pys: number[] = [];
				sample(pxs, pys);
				if (pxs.length > 0) found.push({ xs: pxs, ys: pys });
			}

			// Scale the flock to the screen, then seed it as a loose cloud.
			const want = Math.round(
				Math.max(600, Math.min(9000, birds)) *
					Math.min(1, (w * h) / (1440 * 860)),
			);
			if (want !== n) {
				n = Math.max(500, want);
				px = new Float32Array(n);
				py = new Float32Array(n);
				vx = new Float32Array(n);
				vy = new Float32Array(n);
				depth = new Float32Array(n);
				phase = new Float32Array(n);
				for (let i = 0; i < n; i++) {
					const a = rand() * Math.PI * 2;
					const r = Math.sqrt(rand());
					px[i] = fx + fw * 0.5 + Math.cos(a) * r * fw * 0.22;
					py[i] = fy + fh * 0.4 + Math.sin(a) * r * fh * 0.16;
					depth[i] = 0.55 + rand() * 0.45;
					phase[i] = rand() * Math.PI * 2;
				}
			}
			// The image opens the cycle when it should be the first thing seen
			if (imageFirst && found.length > 1) found.reverse();
			shapes = found.map((points, index) => ({
				tx: new Float32Array(points.xs),
				ty: new Float32Array(points.ys),
				target: mmwAssign(n, points.xs.length, 23 + index),
			}));
			({ tx, ty, target } = shapes[0]);

			// Opening on the image: every bird already on its point, and the
			// clock at the start of the hold, so it is seen formed before it flies
			if (!started && found.length > 1) {
				for (let i = 0; i < n; i++) {
					const ti = target[i];
					if (ti < 0) continue;
					px[i] = tx[ti];
					py[i] = ty[ti];
					vx[i] = Math.cos(phase[i]) * 0.01;
					vy[i] = Math.sin(phase[i]) * 0.01;
				}
				clock = Math.max(1, opts.current.flyFor) + 2.4;
				started = true;
			}

			// Reduced motion: nothing moves, so the birds rest on the word,
			// each with a heading of its own so it still reads as a bird.
			if (reduced) {
				for (let i = 0; i < n; i++) {
					const ti = target[i];
					if (ti < 0) continue;
					px[i] = tx[ti];
					py[i] = ty[ti];
					vx[i] = Math.cos(phase[i]);
					vy[i] = Math.sin(phase[i]) * 0.4;
				}
			}
		};

		const frame = (now: number) => {
			raf = requestAnimationFrame(frame);
			if (!visible || !started) {
				last = now;
				if (!started) ctx.clearRect(0, 0, canvas.width, canvas.height);
				return;
			}
			const dt = reduced ? 0 : Math.min(0.05, (now - last) / 1000);
			last = now;
			clock += dt;
			const o = opts.current;
			const fly = Math.max(1, o.flyFor);
			const hold = Math.max(0.5, o.holdFor);
			const cycle = fly + 2.4 + hold + 0.6;
			const tc = clock % cycle;
			// Each formation takes the next shape
			const shape = shapes[Math.floor(clock / cycle) % shapes.length];
			if (shape) ({ tx, ty, target } = shape);
			// 0 → 1 while forming, 1 while holding, back to 0 on release.
			let pull = 0;
			if (tc > fly && tc <= fly + 2.4) pull = mmwEase((tc - fly) / 2.4);
			else if (tc > fly + 2.4 && tc <= fly + 2.4 + hold) pull = 1;
			else if (tc > fly + 2.4 + hold)
				pull = 1 - mmwEase((tc - fly - 2.4 - hold) / 0.6);

			const u = Math.min(w, h);
			const cen = mmwCentre(clock);
			let cxp = fx + fw / 2 + cen[0] * w * 0.5 * o.roam;
			let cyp = fy + fh * 0.42 + cen[1] * h * o.roam;
			if (o.contain) {
				// The flock gathers around this point: kept well away from the
				// edges, it never presses the birds against one
				const mx = Math.min(u * 0.42, w * 0.42);
				const my = Math.min(u * 0.36, h * 0.38);
				cxp = Math.min(w - mx, Math.max(mx, cxp));
				cyp = Math.min(h - my, Math.max(my, cyp));
			}
			const t = clock * 0.35;
			const hawk = o.interactive && hx > -1e4;
			const hawkR = u * 0.16;

			for (let i = 0; i < n; i++) {
				const x = px[i];
				const y = py[i];
				let ax = 0;
				let ay = 0;
				// Free flight: the current folds the flock, the centre holds it together.
				const fx = (x - w / 2) / u;
				const fy = (y - h / 2) / u;
				const cv = mmwCurl(fx * 2.2 + depth[i] * 0.25, fy * 2.2, t);
				const free = 1 - pull;
				ax += cv[0] * 420 * free;
				ay += cv[1] * 420 * free;
				const dxC = cxp - x;
				const dyC = (cyp - y) * 1.6;
				const dC = Math.hypot(dxC, dyC) / u;
				const keep = dC < 0.14 ? 0.15 : 0.15 + (dC - 0.14) * 6;
				ax += dxC * keep * 2.2 * free;
				ay += dyC * keep * 1.6 * free;
				// Formation: spring to the bird's point in the word.
				const ti = target[i];
				if (pull > 0 && ti >= 0) {
					ax += (tx[ti] - x) * 9 * pull - vx[i] * 3.2 * pull;
					ay += (ty[ti] - y) * 9 * pull - vy[i] * 3.2 * pull;
				}
				// The hawk: a hard shove away inside its radius.
				if (hawk) {
					const dx = x - hx;
					const dy = y - hy;
					const d2 = dx * dx + dy * dy;
					if (d2 < hawkR * hawkR) {
						const d = Math.sqrt(d2) + 0.01;
						const f = (1 - d / hawkR) * 5200;
						ax += (dx / d) * f;
						ay += (dy / d) * f;
					}
				}
				// Contained: a soft wall inside each edge turns the birds back
				// before they reach it, so none is ever cut off by the box. Only in
				// free flight: while forming and holding a shape the wall would
				// push its edge in and flatten it
				if (o.contain && free > 0) {
					// Gentle at first and firmer near the edge, so the birds curve
					// away instead of lining up against it
					const wall = u * 0.18;
					const k = 2600 * free;
					const near = (d: number) => {
						const p = (wall - d) / wall;
						return p * p * k;
					};
					if (x < wall) ax += near(x);
					else if (x > w - wall) ax -= near(w - x);
					if (y < wall) ay += near(y);
					else if (y > h - wall) ay -= near(h - y);
				}
				let nvx = (vx[i] + ax * dt) * (1 - 1.1 * dt);
				let nvy = (vy[i] + ay * dt) * (1 - 1.1 * dt);
				const sp = Math.hypot(nvx, nvy);
				const cap = 520 + 380 * pull;
				if (sp > cap) {
					nvx = (nvx / sp) * cap;
					nvy = (nvy / sp) * cap;
				}
				vx[i] = nvx;
				vy[i] = nvy;
				px[i] = x + nvx * dt;
				py[i] = y + nvy * dt;
				if (o.contain) {
					// Last resort, rarely reached: a bird is about 8 px across
					px[i] = Math.min(w - 4, Math.max(4, px[i]));
					py[i] = Math.min(h - 4, Math.max(4, py[i]));
				}
				phase[i] += dt * (9 + sp * 0.02);
			}

			ctx.setTransform(1, 0, 0, 1, 0, 0);
			if (sky) ctx.drawImage(sky, 0, 0);
			else ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			// Two depth passes so near birds read darker and heavier.
			for (let pass = 0; pass < 2; pass++) {
				ctx.beginPath();
				for (let i = 0; i < n; i++) {
					const near = depth[i] > 0.78;
					if ((pass === 1) !== near) continue;
					const s = (1.6 + depth[i] * 2.2) * (1 - 0.35 * pull);
					const sp = Math.hypot(vx[i], vy[i]) + 0.001;
					const dx = vx[i] / sp;
					const dy = vy[i] / sp;
					const flap = 0.55 + 0.45 * Math.sin(phase[i]);
					const bx = px[i];
					const by = py[i];
					// A "v": two wings swept back from the body, opening and closing.
					const wx = -dx * s;
					const wy = -dy * s;
					const nx = -dy * s * flap;
					const ny = dx * s * flap;
					ctx.moveTo(bx + wx + nx, by + wy + ny);
					ctx.lineTo(bx, by);
					ctx.lineTo(bx + wx - nx, by + wy - ny);
				}
				ctx.strokeStyle = inkRef.current;
				ctx.globalAlpha = pass === 0 ? 0.55 : 0.92;
				ctx.lineWidth = pass === 0 ? 0.9 : 1.25;
				ctx.stroke();
			}
			ctx.globalAlpha = 1;
		};

		const onMove = (e: PointerEvent) => {
			const b = canvas.getBoundingClientRect();
			hx = e.clientX - b.left;
			hy = e.clientY - b.top;
		};
		const onLeave = () => {
			hx = -1e5;
			hy = -1e5;
		};

		let alive = true;
		if (image) {
			picture = new Image();
			picture.onload = () => {
				if (alive) layout();
			};
			// Without the image the flock simply starts on the word
			picture.onerror = () => {
				started = true;
			};
			picture.src = image;
		}
		layout();
		raf = requestAnimationFrame(frame);
		root.addEventListener("pointermove", onMove);
		root.addEventListener("pointerleave", onLeave);
		const ro = new ResizeObserver(() => layout());
		ro.observe(root);
		const io = new IntersectionObserver((entries) => {
			visible = entries[0] ? entries[0].isIntersecting : true;
		});
		io.observe(root);
		if (document.fonts?.ready) {
			document.fonts.ready.then(() => {
				if (alive) layout();
			});
		}
		return () => {
			alive = false;
			cancelAnimationFrame(raf);
			ro.disconnect();
			io.disconnect();
			root.removeEventListener("pointermove", onMove);
			root.removeEventListener("pointerleave", onLeave);
		};
	}, [
		word,
		birds,
		skyTop,
		skyLow,
		sunColor,
		skyReed,
		reeds,
		fontFamily,
		image,
		transparent,
		startWithImage,
		focusX,
		focusY,
		focusW,
		focusH,
	]);

	return (
		<div
			ref={rootRef}
			className={`mmw-root ${className}`}
			style={
				{
					height,
					"--mmw-sky": transparent ? "transparent" : skyTop,
				} as React.CSSProperties
			}
		>
			<style>{MMW_CSS}</style>
			<canvas ref={canvasRef} role="img" aria-label={word} />
			{children ? <div className="mmw-over">{children}</div> : null}
		</div>
	);
}
