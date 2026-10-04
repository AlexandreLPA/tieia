/**
 * Ransom-note text: every letter on its own scrap of magazine paper, with a
 * different font, size, color and tilt. The randomness comes from a seed so
 * the preview, the export and every re-render draw exactly the same letters.
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface Paper {
	bg: string;
	fg: string;
}

const COLOR_PAPERS: Paper[] = [
	{ bg: "#ffffff", fg: "#111111" },
	{ bg: "#f3e9d2", fg: "#111111" },
	{ bg: "#111111", fg: "#ffffff" },
	{ bg: "#ffd400", fg: "#111111" },
	{ bg: "#e63946", fg: "#ffffff" },
	{ bg: "#ff8fc7", fg: "#111111" },
	{ bg: "#4cc9f0", fg: "#111111" },
	{ bg: "#d9d9d9", fg: "#c1121f" },
	{ bg: "#2a9d8f", fg: "#ffffff" },
];

const MONO_PAPERS: Paper[] = [
	{ bg: "#ffffff", fg: "#111111" },
	{ bg: "#111111", fg: "#ffffff" },
	{ bg: "#ece6d6", fg: "#111111" },
	{ bg: "#cfcfcf", fg: "#111111" },
	{ bg: "#ffffff", fg: "#c1121f" },
];

// Fonts every desktop has, so the look doesn't depend on downloads
const FONTS = [
	'"Arial Black", Arial, sans-serif',
	'Georgia, "Times New Roman", serif',
	'Impact, "Arial Narrow", sans-serif',
	'"Courier New", Courier, monospace',
	'"Trebuchet MS", Arial, sans-serif',
	'"Times New Roman", Times, serif',
	"Verdana, Arial, sans-serif",
];

const STYLES = ["normal 700", "normal 400", "italic 700", "normal 900"];

/** Small deterministic PRNG (mulberry32). */
function random(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

interface Glyph {
	char: string;
	font: string;
	paper: Paper;
	width: number;
	height: number;
	rotate: number;
	dy: number;
	corners: number[];
}

/** Letters are wider on paper than in plain text; wrap a bit earlier. */
export const CUTOUT_WIDTH_FACTOR = 1.45;

function layoutLine({
	ctx,
	line,
	fontSize,
	seed,
	lineIndex,
	mono,
}: {
	ctx: Ctx;
	line: string;
	fontSize: number;
	seed: number;
	lineIndex: number;
	mono: boolean;
}): { glyphs: (Glyph | null)[]; width: number; gap: number } {
	const papers = mono ? MONO_PAPERS : COLOR_PAPERS;
	const gap = fontSize * 0.05;
	const glyphs: (Glyph | null)[] = [];
	let width = 0;

	Array.from(line).forEach((char, index) => {
		if (char.trim() === "") {
			glyphs.push(null);
			width += fontSize * 0.35;
			return;
		}
		const rand = random(seed * 1_000_003 + lineIndex * 7_919 + index * 104_729);
		const size = fontSize * (0.85 + rand() * 0.35);
		const font = `${STYLES[Math.floor(rand() * STYLES.length)]} ${size}px ${
			FONTS[Math.floor(rand() * FONTS.length)]
		}`;
		ctx.font = font;
		const glyphWidth = ctx.measureText(char).width;
		const pad = fontSize * (0.1 + rand() * 0.08);
		const glyph: Glyph = {
			char,
			font,
			paper: papers[Math.floor(rand() * papers.length)],
			width: glyphWidth + pad * 2,
			height: size * 1.15 + pad,
			rotate: ((rand() - 0.5) * 16 * Math.PI) / 180,
			dy: (rand() - 0.5) * fontSize * 0.16,
			// Slightly uneven corners read as hand-cut paper
			corners: Array.from(
				{ length: 8 },
				() => (rand() - 0.5) * fontSize * 0.08,
			),
		};
		glyphs.push(glyph);
		width += glyph.width + gap;
	});

	return { glyphs, width: Math.max(0, width - gap), gap };
}

export function drawCutoutLine({
	ctx,
	line,
	y,
	fontSize,
	textAlign,
	seed,
	lineIndex,
	mono,
	maxWidth,
}: {
	ctx: Ctx;
	line: string;
	y: number;
	fontSize: number;
	textAlign: CanvasTextAlign;
	seed: number;
	lineIndex: number;
	mono: boolean;
	/** A single long word can't wrap, so the line shrinks to fit instead */
	maxWidth: number;
}): void {
	const { glyphs, width, gap } = layoutLine({
		ctx,
		line,
		fontSize,
		seed,
		lineIndex,
		mono,
	});
	const fit = width > maxWidth ? maxWidth / width : 1;
	ctx.save();
	ctx.translate(0, y);
	ctx.scale(fit, fit);
	ctx.translate(0, -y);
	let x =
		textAlign === "center" ? -width / 2 : textAlign === "right" ? -width : 0;

	for (const glyph of glyphs) {
		if (!glyph) {
			x += fontSize * 0.35;
			continue;
		}
		const cx = x + glyph.width / 2;
		const halfW = glyph.width / 2;
		const halfH = glyph.height / 2;
		const c = glyph.corners;

		ctx.save();
		ctx.translate(cx, y + glyph.dy);
		ctx.rotate(glyph.rotate);

		ctx.beginPath();
		ctx.moveTo(-halfW + c[0], -halfH + c[1]);
		ctx.lineTo(halfW + c[2], -halfH + c[3]);
		ctx.lineTo(halfW + c[4], halfH + c[5]);
		ctx.lineTo(-halfW + c[6], halfH + c[7]);
		ctx.closePath();
		ctx.shadowColor = "rgba(0,0,0,0.35)";
		ctx.shadowBlur = fontSize * 0.12;
		ctx.shadowOffsetY = fontSize * 0.05;
		ctx.fillStyle = glyph.paper.bg;
		ctx.fill();

		ctx.shadowColor = "transparent";
		ctx.font = glyph.font;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillStyle = glyph.paper.fg;
		ctx.fillText(glyph.char, 0, fontSize * 0.04);
		ctx.restore();

		x += glyph.width + gap;
	}
	ctx.restore();
}
