import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";
import { desktopDbDir } from "@/lib/desktop";

// One database per server process: the module can be loaded more than once
// by Next.js, and two PGlite instances must never open the same folder
const holder = globalThis as unknown as {
	__tieaiEmbeddedDb?: ReturnType<typeof drizzle<typeof schema>>;
};

/** The editor's database inside the desktop app's data folder. */
export function createEmbeddedDb() {
	if (!holder.__tieaiEmbeddedDb) {
		if (!desktopDbDir) {
			throw new Error("OPENCUT_DB_DIR is not set: the desktop app sets it.");
		}
		holder.__tieaiEmbeddedDb = drizzle(new PGlite(desktopDbDir), { schema });
	}
	return holder.__tieaiEmbeddedDb;
}

/**
 * Brings the embedded database up to the current schema, with the same
 * migrations the Postgres server gets. Runs once when the server starts.
 */
export async function migrateEmbeddedDb(migrationsFolder: string) {
	await migrate(createEmbeddedDb(), {
		migrationsFolder,
		migrationsTable: "drizzle_migrations",
	});
}
