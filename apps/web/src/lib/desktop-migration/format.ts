/**
 * Moving the editor's browser storage (from Edge, where the Docker launcher
 * opened it, into the desktop app) goes through files on disk: a manifest
 * with every IndexedDB database and localStorage entry, plus one file per
 * binary (OPFS media and the Blobs kept in IndexedDB).
 *
 * IndexedDB values are structured clones, not JSON: Blobs, ArrayBuffers,
 * typed arrays, Dates, Maps and Sets are written as tagged objects, and the
 * binaries go out as separate files.
 */

export const MIGRATION_API = "/api/desktop/migration";

export interface StoreSnapshot {
	name: string;
	keyPath: string | string[] | null;
	autoIncrement: boolean;
	indexes: {
		name: string;
		keyPath: string | string[];
		unique: boolean;
		multiEntry: boolean;
	}[];
	/** Out-of-line keys go with each record; inline ones are in the value */
	records: { key: unknown; value: unknown }[];
}

export interface DatabaseSnapshot {
	name: string;
	version: number;
	stores: StoreSnapshot[];
}

export interface MigrationManifest {
	format: 1;
	createdAt: string;
	localStorage: Record<string, string>;
	databases: DatabaseSnapshot[];
	/** OPFS files, by their path inside the origin's root directory */
	files: { path: string; size: number; type: string; lastModified: number }[];
	/** Blobs that were inside IndexedDB values, by number */
	blobs: { size: number; type: string }[];
}

type Tagged =
	| {
			__t: "blob";
			i: number;
			type: string;
			name?: string;
			lastModified?: number;
	  }
	| { __t: "buffer"; i: number }
	| { __t: "view"; i: number; kind: string }
	| { __t: "date"; v: number }
	| { __t: "map"; v: [unknown, unknown][] }
	| { __t: "set"; v: unknown[] }
	| { __t: "undefined" }
	| { __t: "object"; v: Record<string, unknown> };

const VIEW_KINDS: Record<string, new (buffer: ArrayBuffer) => ArrayBufferView> =
	{
		Int8Array,
		Uint8Array,
		Uint8ClampedArray,
		Int16Array,
		Uint16Array,
		Int32Array,
		Uint32Array,
		Float32Array,
		Float64Array,
		BigInt64Array,
		BigUint64Array,
		DataView,
	};

/**
 * A value as JSON-safe data. Binaries are pushed to `binaries` and replaced by
 * their number; plain objects that happen to have a `__t` key are wrapped so
 * they can't be mistaken for a tag.
 */
export function encodeValue(value: unknown, binaries: Blob[]): unknown {
	if (value === undefined) return { __t: "undefined" } satisfies Tagged;
	if (value === null || typeof value !== "object") return value;
	if (value instanceof Blob) {
		binaries.push(value);
		const file = value instanceof File ? value : null;
		return {
			__t: "blob",
			i: binaries.length - 1,
			type: value.type,
			...(file && { name: file.name, lastModified: file.lastModified }),
		} satisfies Tagged;
	}
	if (value instanceof ArrayBuffer) {
		binaries.push(new Blob([value]));
		return { __t: "buffer", i: binaries.length - 1 } satisfies Tagged;
	}
	if (ArrayBuffer.isView(value)) {
		const bytes = new Uint8Array(
			value.buffer,
			value.byteOffset,
			value.byteLength,
		);
		binaries.push(new Blob([bytes.slice()]));
		return {
			__t: "view",
			i: binaries.length - 1,
			kind: value.constructor.name,
		} satisfies Tagged;
	}
	if (value instanceof Date)
		return { __t: "date", v: value.getTime() } satisfies Tagged;
	if (value instanceof Map) {
		return {
			__t: "map",
			v: [...value].map(([k, v]) => [
				encodeValue(k, binaries),
				encodeValue(v, binaries),
			]),
		} satisfies Tagged;
	}
	if (value instanceof Set) {
		return {
			__t: "set",
			v: [...value].map((v) => encodeValue(v, binaries)),
		} satisfies Tagged;
	}
	if (Array.isArray(value)) return value.map((v) => encodeValue(v, binaries));
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value)) out[k] = encodeValue(v, binaries);
	return "__t" in out ? ({ __t: "object", v: out } satisfies Tagged) : out;
}

/** The reverse of `encodeValue`, with the binaries already downloaded. */
export function decodeValue(value: unknown, binaries: Blob[]): unknown {
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map((v) => decodeValue(v, binaries));
	const tagged = value as Partial<Tagged> & Record<string, unknown>;
	switch (tagged.__t) {
		case "undefined":
			return undefined;
		case "blob": {
			const t = tagged as Extract<Tagged, { __t: "blob" }>;
			const blob = binaries[t.i];
			return t.name !== undefined
				? new File([blob], t.name, {
						type: t.type,
						lastModified: t.lastModified,
					})
				: new Blob([blob], { type: t.type });
		}
		case "buffer":
			return binaries[(tagged as { i: number }).i].arrayBuffer();
		case "view": {
			const t = tagged as Extract<Tagged, { __t: "view" }>;
			return binaries[t.i].arrayBuffer().then((buffer) => {
				const View = VIEW_KINDS[t.kind] ?? Uint8Array;
				return new View(buffer);
			});
		}
		case "date":
			return new Date((tagged as { v: number }).v);
		case "map":
			return new Map(
				(tagged as { v: [unknown, unknown][] }).v.map(([k, v]) => [
					decodeValue(k, binaries),
					decodeValue(v, binaries),
				]),
			);
		case "set":
			return new Set(
				(tagged as { v: unknown[] }).v.map((v) => decodeValue(v, binaries)),
			);
		case "object":
			return decodeObject(
				(tagged as { v: Record<string, unknown> }).v,
				binaries,
			);
		default:
			return decodeObject(tagged, binaries);
	}
}

function decodeObject(value: Record<string, unknown>, binaries: Blob[]) {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value)) out[k] = decodeValue(v, binaries);
	return out;
}

/** Waits for the ArrayBuffers that `decodeValue` reads asynchronously. */
export async function settle(value: unknown): Promise<unknown> {
	if (value instanceof Promise) return settle(await value);
	if (value === null || typeof value !== "object") return value;
	if (
		value instanceof Blob ||
		value instanceof Date ||
		ArrayBuffer.isView(value)
	)
		return value;
	if (value instanceof ArrayBuffer) return value;
	if (value instanceof Map) {
		const entries = await Promise.all(
			[...value].map(
				async ([k, v]) => [await settle(k), await settle(v)] as const,
			),
		);
		return new Map(entries);
	}
	if (value instanceof Set)
		return new Set(await Promise.all([...value].map(settle)));
	if (Array.isArray(value)) return Promise.all(value.map(settle));
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value)) out[k] = await settle(v);
	return out;
}

/** The file name of a binary on disk. */
export function blobFileName(index: number) {
	return `blobs/${index}`;
}

export function opfsFileName(path: string) {
	return `opfs/${path}`;
}
