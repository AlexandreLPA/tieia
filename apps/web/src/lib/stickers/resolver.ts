import { getProvider } from "./registry";
import { parseStickerId } from "./sticker-id";
import { registerDefaultStickerProviders } from "./providers";
import type { StickerResolveOptions } from "@/types/stickers";
import { KLIPY_STICKER_PREFIX } from "@/lib/klipy";

export function resolveStickerId({
	stickerId,
	options,
}: {
	stickerId: string;
	options?: StickerResolveOptions;
}): string {
	registerDefaultStickerProviders();

	const parsedStickerId = parseStickerId({ stickerId });
	// KLIPY stickers keep their media URL in the id and load it directly; they
	// are not a browsable provider so they never mix into other sticker results
	if (parsedStickerId.providerId === KLIPY_STICKER_PREFIX) {
		return parsedStickerId.providerValue;
	}
	return getProvider({
		providerId: parsedStickerId.providerId,
	}).resolveUrl({
		stickerId,
		options,
	});
}
