import path from "node:path";
import { isDesktop } from "@/lib/desktop";

/**
 * Where the desktop app keeps a copy of the browser's storage between the
 * page that sends it (in Edge) and the app window that takes it in.
 */
export const migrationDir = process.env.OPENCUT_MIGRATION_DIR ?? "";

export const MANIFEST_FILE = "manifest.json";

/** Only the desktop app's server takes part; the web editor answers 404. */
export function notAvailable() {
	if (isDesktop && migrationDir) return null;
	return new Response("Not found", { status: 404 });
}

/** The file's path on disk, or null for a name outside the copy's folder. */
export function resolveName(name: string | null): string | null {
	if (!name || name.length > 600) return null;
	if (!/^(opfs|blobs)\//.test(name)) return null;
	const parts = name.split("/");
	if (
		parts.some(
			(part) =>
				part === "" || part === "." || part === ".." || part.includes("\\"),
		)
	) {
		return null;
	}
	const full = path.resolve(migrationDir, ...parts);
	const root = path.resolve(migrationDir) + path.sep;
	return full.startsWith(root) ? full : null;
}
