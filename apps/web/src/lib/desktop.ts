/**
 * Set by the desktop app (apps/desktop) when it starts the editor's server:
 * one user on one computer, with no Postgres, Redis or Docker behind it.
 */
export const isDesktop = process.env.OPENCUT_DESKTOP === "1";

/** Where the desktop app keeps the editor's database (an embedded Postgres). */
export const desktopDbDir = process.env.OPENCUT_DB_DIR ?? "";
