import { betterAuth, type RateLimit } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Redis } from "@upstash/redis";
import { db } from "@/lib/db";
import { webEnv } from "@opencut-ai/env/web";
import { isDesktop } from "@/lib/desktop";

const redis = new Redis({
	url: webEnv.UPSTASH_REDIS_REST_URL,
	token: webEnv.UPSTASH_REDIS_REST_TOKEN,
});

// The desktop app has no Redis: one user, one process, so a map is enough
const memory = new Map<string, RateLimit>();

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		usePlural: true,
	}),
	secret: webEnv.BETTER_AUTH_SECRET,
	user: {
		deleteUser: {
			enabled: true,
		},
	},
	emailAndPassword: {
		enabled: true,
	},
	rateLimit: {
		storage: "secondary-storage",
		customStorage: {
			get: async (key) => {
				if (isDesktop) return memory.get(key);
				const value = await redis.get(key);
				return value as RateLimit | undefined;
			},
			set: async (key, value) => {
				if (isDesktop) {
					memory.set(key, value);
					return;
				}
				await redis.set(key, value);
			},
		},
	},
	baseURL: webEnv.NEXT_PUBLIC_SITE_URL,
	appName: "Tiê AI",
	trustedOrigins: [webEnv.NEXT_PUBLIC_SITE_URL],
});

export type Auth = typeof auth;
