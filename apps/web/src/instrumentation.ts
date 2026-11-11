/**
 * Runs once when the server starts, before it answers any request. In the
 * desktop app it brings the embedded database up to the current schema.
 */
export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	if (process.env.OPENCUT_DESKTOP !== "1") return;
	const folder = process.env.OPENCUT_MIGRATIONS_DIR;
	if (!folder) throw new Error("OPENCUT_MIGRATIONS_DIR is not set.");
	const { migrateEmbeddedDb } = await import("@/lib/db/embedded");
	await migrateEmbeddedDb(folder);
}
