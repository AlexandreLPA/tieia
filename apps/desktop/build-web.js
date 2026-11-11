// Builds the editor for the desktop app: a Next.js standalone server in
// apps/web/.next-desktop/standalone, with what it needs beside it (static
// files, public files and the database migrations).
//
//   node apps/desktop/build-web.js

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const WEB = path.resolve(__dirname, "../web");
const OUT = path.join(WEB, ".next-desktop");
const SERVER_DIR = path.join(OUT, "standalone", "apps", "web");

const bun = process.platform === "win32" ? "bun.exe" : "bun";
execFileSync(bun, ["x", "next", "build"], {
	cwd: WEB,
	stdio: "inherit",
	env: {
		...process.env,
		OPENCUT_DESKTOP_BUILD: "1",
		NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
		NEXT_TELEMETRY_DISABLED: "1",
		// Read while building; the app passes the real values when it starts
		DATABASE_URL: "postgresql://embedded/tieai",
		BETTER_AUTH_SECRET: "build-time-placeholder",
	},
});

// The standalone server leaves these out on purpose: they are copied in
const copies = [
	[path.join(OUT, "static"), path.join(SERVER_DIR, ".next-desktop", "static")],
	[path.join(WEB, "public"), path.join(SERVER_DIR, "public")],
	[path.join(WEB, "migrations"), path.join(SERVER_DIR, "migrations")],
];
for (const [from, to] of copies) {
	fs.rmSync(to, { recursive: true, force: true });
	fs.cpSync(from, to, { recursive: true });
}

if (!fs.existsSync(path.join(SERVER_DIR, "server.js"))) {
	throw new Error(
		`The standalone server is not where it was expected: ${SERVER_DIR}`,
	);
}
console.log(`\nEditor ready for the app: ${SERVER_DIR}`);
