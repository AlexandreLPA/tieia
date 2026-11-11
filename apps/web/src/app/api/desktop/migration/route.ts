import { promises as fs } from "node:fs";
import path from "node:path";
import { MANIFEST_FILE, migrationDir, notAvailable } from "./storage";

export const dynamic = "force-dynamic";

/** The copy's manifest, once the page in the browser finished sending it. */
export async function GET() {
	const missing = notAvailable();
	if (missing) return missing;
	try {
		const text = await fs.readFile(
			path.join(migrationDir, MANIFEST_FILE),
			"utf8",
		);
		return new Response(text, {
			headers: { "Content-Type": "application/json" },
		});
	} catch {
		return new Response("No copy", { status: 404 });
	}
}

/** Written last by the sending page: the copy is complete. */
export async function POST(request: Request) {
	const missing = notAvailable();
	if (missing) return missing;
	const text = await request.text();
	try {
		JSON.parse(text);
	} catch {
		return new Response("Invalid manifest", { status: 400 });
	}
	await fs.mkdir(migrationDir, { recursive: true });
	await fs.writeFile(path.join(migrationDir, MANIFEST_FILE), text, "utf8");
	return new Response(null, { status: 204 });
}

/** Removes the copy: before a new one is sent, and after the app took it in. */
export async function DELETE() {
	const missing = notAvailable();
	if (missing) return missing;
	await fs.rm(migrationDir, { recursive: true, force: true });
	return new Response(null, { status: 204 });
}
