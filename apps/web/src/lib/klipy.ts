/**
 * KLIPY GIF & sticker search (https://docs.klipy.com).
 *
 * Their standard integration terms: requests and media loads come straight
 * from the user's browser, media is used from the returned URLs (no stored
 * copies), results keep their order, and the search box reads "Search KLIPY".
 * So elements only keep the media URL, and the key lives in this browser.
 */

const API_BASE = "https://api.klipy.com/api/v1";
const KEY_STORAGE = "opencut:klipy-app-key";
const CUSTOMER_STORAGE = "opencut:klipy-customer-id";
export const KLIPY_SIGNUP_URL = "https://partner.klipy.com";
export const KLIPY_STICKER_PREFIX = "klipy";

export type KlipyKind = "stickers" | "gifs";

interface KlipyFormat {
	url: string;
	width: number;
	height: number;
	size: number;
}

type KlipySize = Partial<Record<"gif" | "webp" | "webm" | "png" | "jpg" | "mp4", KlipyFormat>>;

export interface KlipyItem {
	id: number;
	slug: string;
	title: string;
	type?: string;
	file?: Partial<Record<"hd" | "md" | "sm" | "xs", KlipySize>>;
}

export interface KlipyPage {
	items: KlipyItem[];
	page: number;
	hasNext: boolean;
}

export class KlipyError extends Error {
	constructor(
		message: string,
		readonly status?: number,
	) {
		super(message);
	}
}

function storage(): Storage | null {
	try {
		return typeof window === "undefined" ? null : window.localStorage;
	} catch {
		return null;
	}
}

export function getKlipyKey(): string | null {
	return storage()?.getItem(KEY_STORAGE)?.trim() || null;
}

export function setKlipyKey(key: string | null): void {
	const store = storage();
	if (!store) return;
	if (key?.trim()) store.setItem(KEY_STORAGE, key.trim());
	else store.removeItem(KEY_STORAGE);
}

/** Stable per-browser id; KLIPY asks for a consistent customer_id per user. */
function getCustomerId(): string {
	const store = storage();
	let id = store?.getItem(CUSTOMER_STORAGE);
	if (!id) {
		id = crypto.randomUUID();
		store?.setItem(CUSTOMER_STORAGE, id);
	}
	return id;
}

export async function searchKlipy({
	kind,
	query,
	page = 1,
	perPage = 24,
	key = getKlipyKey(),
}: {
	kind: KlipyKind;
	query: string;
	page?: number;
	perPage?: number;
	key?: string | null;
}): Promise<KlipyPage> {
	if (!key) throw new KlipyError("Falta a chave da KLIPY");
	const q = query.trim();
	const endpoint = q ? "search" : "trending";
	const params = new URLSearchParams({
		page: String(page),
		per_page: String(perPage),
		customer_id: getCustomerId(),
		locale: "br",
		// Ads and sales videos: keep explicit content out
		content_filter: "medium",
	});
	if (q) params.set("q", q);

	const response = await fetch(
		`${API_BASE}/${encodeURIComponent(key)}/${kind}/${endpoint}?${params}`,
	);
	if (!response.ok) {
		throw new KlipyError(
			response.status === 401 || response.status === 403 || response.status === 404
				? "A KLIPY recusou a chave. Confira se ela foi copiada inteira."
				: response.status === 429
					? "Limite de buscas da chave de teste atingido; espere um minuto."
					: `A KLIPY respondeu com erro (${response.status}).`,
			response.status,
		);
	}
	const body = (await response.json()) as {
		result?: boolean;
		data?: { data?: KlipyItem[]; current_page?: number; has_next?: boolean };
	};
	return {
		items: body.data?.data ?? [],
		page: body.data?.current_page ?? page,
		hasNext: Boolean(body.data?.has_next),
	};
}

/** Tells KLIPY an item was used (their analytics/ranking); never blocks. */
export function reportKlipyShare({
	kind,
	slug,
	query,
}: {
	kind: KlipyKind;
	slug: string;
	query: string;
}): void {
	const key = getKlipyKey();
	if (!key) return;
	void fetch(`${API_BASE}/${encodeURIComponent(key)}/${kind}/share/${encodeURIComponent(slug)}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ customer_id: getCustomerId(), q: query.trim() }),
	}).catch(() => {});
}

/** Small animated preview for the grid. */
export function klipyPreviewUrl(item: KlipyItem): string | null {
	const size = item.file?.sm ?? item.file?.xs ?? item.file?.md;
	return size?.webp?.url ?? size?.gif?.url ?? size?.png?.url ?? null;
}

/** The version placed in the video: sharp, animated, transparent for stickers. */
export function klipyMediaUrl(item: KlipyItem): string | null {
	const size = item.file?.hd ?? item.file?.md;
	return size?.webp?.url ?? size?.gif?.url ?? size?.png?.url ?? null;
}
