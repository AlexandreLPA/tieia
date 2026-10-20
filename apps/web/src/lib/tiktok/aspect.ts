export const TIKTOK_UPLOAD_PAGE_URL = "https://www.tiktok.com/upload";

/** TikTok's feed is vertical 9:16; a 1% tolerance covers odd canvas sizes like 1080x1921. */
export function isNineBySixteen({
	width,
	height,
}: {
	width: number;
	height: number;
}): boolean {
	if (width <= 0 || height <= 0) return false;
	return Math.abs(width / height - 9 / 16) <= (9 / 16) * 0.01;
}

function greatestCommonDivisor(a: number, b: number): number {
	return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/** "16:9", "1:1", or the raw size when the ratio has no short form. */
export function describeAspectRatio({
	width,
	height,
}: {
	width: number;
	height: number;
}): string {
	const w = Math.round(width);
	const h = Math.round(height);
	if (w <= 0 || h <= 0) return `${w}×${h}`;
	const divisor = greatestCommonDivisor(w, h);
	const ratioWidth = w / divisor;
	const ratioHeight = h / divisor;
	if (ratioWidth <= 32 && ratioHeight <= 32) {
		return `${ratioWidth}:${ratioHeight}`;
	}
	return `${w}×${h}`;
}
