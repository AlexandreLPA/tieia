import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { notAvailable, resolveName } from "../storage";

export const dynamic = "force-dynamic";

function target(request: Request) {
	return resolveName(new URL(request.url).searchParams.get("name"));
}

/** One file of the copy (a media file or a binary from IndexedDB), streamed to disk. */
export async function PUT(request: Request) {
	const missing = notAvailable();
	if (missing) return missing;
	const file = target(request);
	if (!file) return new Response("Invalid name", { status: 400 });
	await fs.mkdir(path.dirname(file), { recursive: true });
	if (request.body) {
		await pipeline(
			Readable.fromWeb(request.body as unknown as WebReadableStream),
			createWriteStream(file),
		);
	} else {
		await fs.writeFile(file, "");
	}
	return new Response(null, { status: 204 });
}

/** The same file, streamed back to the app window. */
export async function GET(request: Request) {
	const missing = notAvailable();
	if (missing) return missing;
	const file = target(request);
	if (!file) return new Response("Invalid name", { status: 400 });
	try {
		const { size } = await fs.stat(file);
		const stream = Readable.toWeb(
			createReadStream(file),
		) as unknown as ReadableStream;
		return new Response(stream, {
			headers: {
				"Content-Type": "application/octet-stream",
				"Content-Length": String(size),
			},
		});
	} catch {
		return new Response("Not found", { status: 404 });
	}
}
