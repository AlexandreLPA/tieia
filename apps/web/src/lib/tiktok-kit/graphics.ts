/**
 * Overlay graphics for TikTok Shop style edits, drawn on transparent canvases
 * so they need no chroma key. The feed overlay is a generic short-video UI
 * (no platform logo or brand marks).
 */

type Ctx = CanvasRenderingContext2D;

function makeCanvas(width: number, height: number): [HTMLCanvasElement, Ctx] {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas 2D indisponível");
	return [canvas, ctx];
}

export function canvasToPngFile(
	canvas: HTMLCanvasElement,
	name: string,
): Promise<File> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (!blob) {
				reject(new Error("Falha ao gerar a imagem"));
				return;
			}
			resolve(new File([blob], name, { type: "image/png" }));
		}, "image/png");
	});
}

function withShadow(ctx: Ctx, unit: number, draw: () => void) {
	ctx.save();
	ctx.shadowColor = "rgba(0,0,0,0.45)";
	ctx.shadowBlur = unit * 0.6;
	ctx.shadowOffsetY = unit * 0.15;
	draw();
	ctx.restore();
}

function heartPath(ctx: Ctx, cx: number, cy: number, size: number) {
	const s = size / 2;
	ctx.beginPath();
	ctx.moveTo(cx, cy + s * 0.85);
	ctx.bezierCurveTo(cx - s * 1.3, cy - s * 0.1, cx - s * 0.6, cy - s * 1.05, cx, cy - s * 0.4);
	ctx.bezierCurveTo(cx + s * 0.6, cy - s * 1.05, cx + s * 1.3, cy - s * 0.1, cx, cy + s * 0.85);
	ctx.closePath();
}

function bubblePath(ctx: Ctx, cx: number, cy: number, size: number) {
	const r = size * 0.48;
	ctx.beginPath();
	ctx.ellipse(cx, cy - size * 0.04, r, r * 0.86, 0, 0, Math.PI * 2);
	ctx.moveTo(cx - r * 0.35, cy + r * 0.72);
	ctx.lineTo(cx - r * 0.6, cy + r * 1.15);
	ctx.lineTo(cx + r * 0.05, cy + r * 0.8);
	ctx.closePath();
}

function bookmarkPath(ctx: Ctx, cx: number, cy: number, size: number) {
	const w = size * 0.62;
	const h = size * 0.82;
	ctx.beginPath();
	ctx.moveTo(cx - w / 2, cy - h / 2);
	ctx.lineTo(cx + w / 2, cy - h / 2);
	ctx.lineTo(cx + w / 2, cy + h / 2);
	ctx.lineTo(cx, cy + h * 0.22);
	ctx.lineTo(cx - w / 2, cy + h / 2);
	ctx.closePath();
}

function sharePath(ctx: Ctx, cx: number, cy: number, size: number) {
	const s = size / 2;
	ctx.beginPath();
	ctx.moveTo(cx + s, cy - s * 0.05);
	ctx.lineTo(cx + s * 0.05, cy - s * 0.85);
	ctx.lineTo(cx + s * 0.05, cy - s * 0.4);
	ctx.bezierCurveTo(cx - s * 0.7, cy - s * 0.35, cx - s, cy + s * 0.3, cx - s * 0.95, cy + s * 0.85);
	ctx.bezierCurveTo(cx - s * 0.6, cy + s * 0.25, cx - s * 0.2, cy + s * 0.15, cx + s * 0.05, cy + s * 0.2);
	ctx.lineTo(cx + s * 0.05, cy + s * 0.7);
	ctx.closePath();
}

/** Full-frame feed UI: status bar, tabs, action column, profile and caption. */
export function drawFeedOverlay({
	width,
	height,
	username = "@seuperfil",
	caption = "Achei o produto perfeito 😍 #tiktokshop #achadinhos",
}: {
	width: number;
	height: number;
	username?: string;
	caption?: string;
}): HTMLCanvasElement {
	const [canvas, ctx] = makeCanvas(width, height);
	// Everything is sized from the width so 9:16 and other ratios both work
	const u = width / 100;
	ctx.fillStyle = "#fff";
	ctx.strokeStyle = "#fff";
	ctx.textBaseline = "middle";
	const font = (weight: number, size: number) =>
		`${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

	withShadow(ctx, u, () => {
		// Status bar
		ctx.font = font(600, u * 3.6);
		ctx.textAlign = "left";
		ctx.fillText("9:41", u * 7, u * 4.5);
		ctx.textAlign = "right";
		ctx.fillRect(width - u * 12, u * 3.4, u * 5.2, u * 2.3);
		ctx.fillRect(width - u * 6.6, u * 4, u * 0.6, u * 1.1);
		for (let i = 0; i < 4; i++) {
			const h = u * (0.8 + i * 0.5);
			ctx.fillRect(width - u * (24 - i * 1.4), u * 5.7 - h, u * 0.9, h);
		}

		// Tabs
		const tabsY = u * 12;
		ctx.textAlign = "center";
		ctx.font = font(600, u * 4.4);
		ctx.globalAlpha = 0.7;
		ctx.fillText("Seguindo", width / 2 - u * 13, tabsY);
		ctx.globalAlpha = 1;
		ctx.font = font(700, u * 4.4);
		ctx.fillText("Para você", width / 2 + u * 13, tabsY);
		ctx.fillRect(width / 2 + u * 9, tabsY + u * 3, u * 8, u * 0.6);
		// Search
		ctx.lineWidth = u * 0.7;
		ctx.beginPath();
		ctx.arc(width - u * 8.5, tabsY - u * 0.4, u * 2, 0, Math.PI * 2);
		ctx.moveTo(width - u * 7, tabsY + u * 1.1);
		ctx.lineTo(width - u * 5.4, tabsY + u * 2.7);
		ctx.stroke();
	});

	// Action column
	const colX = width - u * 9;
	let y = height * 0.48;
	withShadow(ctx, u, () => {
		// Avatar with follow badge
		ctx.fillStyle = "#d9d9d9";
		ctx.beginPath();
		ctx.arc(colX, y, u * 5.6, 0, Math.PI * 2);
		ctx.fill();
		ctx.lineWidth = u * 0.5;
		ctx.strokeStyle = "#fff";
		ctx.stroke();
		ctx.fillStyle = "#9a9a9a";
		ctx.beginPath();
		ctx.arc(colX, y - u * 1.3, u * 2, 0, Math.PI * 2);
		ctx.fill();
		ctx.beginPath();
		ctx.ellipse(colX, y + u * 3.2, u * 3.6, u * 2.3, 0, Math.PI, 0);
		ctx.fill();
		ctx.fillStyle = "#fe2c55";
		ctx.beginPath();
		ctx.arc(colX, y + u * 5.6, u * 2, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = "#fff";
		ctx.fillRect(colX - u * 1, y + u * 5.35, u * 2, u * 0.5);
		ctx.fillRect(colX - u * 0.25, y + u * 4.6, u * 0.5, u * 2);
	});

	const counts: [string, (cx: number, cy: number, s: number) => void][] = [
		["28,4 mil", (cx, cy, s) => heartPath(ctx, cx, cy, s)],
		["1.284", (cx, cy, s) => bubblePath(ctx, cx, cy, s)],
		["3.902", (cx, cy, s) => bookmarkPath(ctx, cx, cy, s)],
		["2.117", (cx, cy, s) => sharePath(ctx, cx, cy, s)],
	];
	y += u * 14;
	for (const [label, path] of counts) {
		withShadow(ctx, u, () => {
			ctx.fillStyle = "#fff";
			path(colX, y, u * 8);
			ctx.fill();
			ctx.font = font(600, u * 3);
			ctx.textAlign = "center";
			ctx.fillText(label, colX, y + u * 6.2);
		});
		y += u * 14;
	}
	// Spinning-record placeholder
	withShadow(ctx, u, () => {
		ctx.fillStyle = "#2b2b2b";
		ctx.beginPath();
		ctx.arc(colX, y, u * 4.6, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = "#d9d9d9";
		ctx.beginPath();
		ctx.arc(colX, y, u * 2, 0, Math.PI * 2);
		ctx.fill();
	});

	// Bottom-left: product tag, profile, caption, sound
	const left = u * 4.5;
	let by = height - u * 33;
	withShadow(ctx, u, () => {
		ctx.textAlign = "left";
		// Product tag
		const tagH = u * 7;
		const tagW = u * 44;
		ctx.fillStyle = "rgba(0,0,0,0.38)";
		ctx.beginPath();
		ctx.roundRect(left, by - tagH / 2, tagW, tagH, u * 1.4);
		ctx.fill();
		ctx.fillStyle = "#ff8a00";
		ctx.beginPath();
		ctx.roundRect(left + u * 1, by - tagH / 2 + u * 1, tagH - u * 2, tagH - u * 2, u * 1);
		ctx.fill();
		ctx.fillStyle = "#fff";
		ctx.font = font(700, u * 3.3);
		ctx.fillText("🛒", left + u * 2, by + u * 0.2);
		ctx.font = font(600, u * 3.4);
		ctx.fillText("Produto em oferta · Comprar", left + tagH + u * 0.5, by);

		by += u * 10;
		ctx.font = font(700, u * 4.2);
		ctx.fillText(username, left, by);
		by += u * 6;
		ctx.font = font(400, u * 3.6);
		ctx.fillText(caption, left, by, width - left - u * 22);
		by += u * 6;
		ctx.font = font(500, u * 3.4);
		ctx.fillText(`♫  som original - ${username.replace("@", "")}`, left, by, width - left - u * 22);
	});

	return canvas;
}

const HIGHLIGHT_SIZE = 512;

/** Thick arrow pointing down, red with a white edge so it reads on any shot. */
export function drawArrow(color = "#ff1f1f"): HTMLCanvasElement {
	const [canvas, ctx] = makeCanvas(HIGHLIGHT_SIZE, HIGHLIGHT_SIZE);
	const s = HIGHLIGHT_SIZE;
	ctx.beginPath();
	ctx.moveTo(s * 0.38, s * 0.08);
	ctx.lineTo(s * 0.62, s * 0.08);
	ctx.lineTo(s * 0.62, s * 0.55);
	ctx.lineTo(s * 0.82, s * 0.55);
	ctx.lineTo(s * 0.5, s * 0.92);
	ctx.lineTo(s * 0.18, s * 0.55);
	ctx.lineTo(s * 0.38, s * 0.55);
	ctx.closePath();
	ctx.lineJoin = "round";
	ctx.lineWidth = s * 0.05;
	ctx.strokeStyle = "#fff";
	ctx.shadowColor = "rgba(0,0,0,0.35)";
	ctx.shadowBlur = s * 0.03;
	ctx.stroke();
	ctx.shadowColor = "transparent";
	ctx.fillStyle = color;
	ctx.fill();
	return canvas;
}

/** Hand-drawn style ring to circle a detail. */
export function drawCircle(color = "#ff1f1f"): HTMLCanvasElement {
	const [canvas, ctx] = makeCanvas(HIGHLIGHT_SIZE, HIGHLIGHT_SIZE);
	const s = HIGHLIGHT_SIZE;
	const ring = () => {
		ctx.beginPath();
		// Slightly open and tilted, like a marker circle
		ctx.ellipse(s / 2, s / 2, s * 0.4, s * 0.36, -0.2, 0.15, Math.PI * 2 + 0.05);
	};
	ctx.lineCap = "round";
	ctx.lineWidth = s * 0.075;
	ctx.strokeStyle = "#fff";
	ring();
	ctx.stroke();
	ctx.lineWidth = s * 0.05;
	ctx.strokeStyle = color;
	ring();
	ctx.stroke();
	return canvas;
}
