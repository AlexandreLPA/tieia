import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { webEnv } from "@opencut-ai/env/web";
import { isDesktop } from "@/lib/desktop";
import { createEmbeddedDb } from "./embedded";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getDb() {
	if (!_db) {
		// The desktop app has no Postgres server: the same schema lives in an
		// embedded Postgres (PGlite) in the app's data folder. Both speak
		// Postgres to Drizzle, so the queries are the same.
		_db = isDesktop
			? (createEmbeddedDb() as unknown as ReturnType<
					typeof drizzle<typeof schema>
				>)
			: drizzle(postgres(webEnv.DATABASE_URL), { schema });
	}

	return _db;
}

export const db = getDb();

export * from "./schema";
