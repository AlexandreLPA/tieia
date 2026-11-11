// Tiê AI as a desktop app. It starts the editor's server (the Next.js
// standalone build, run by Electron's own Node) with an embedded database in
// the app's data folder, waits for it to answer, and shows it in a window.
// Nothing here needs Docker; the local AI services still do, until each one
// moves into the app.

const {
	app,
	BrowserWindow,
	Menu,
	dialog,
	session,
	shell,
} = require("electron");
const { spawn, execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

// Projects live in the browser storage of this exact address, so it never changes
// (overridable only to test the app beside a running editor)
const PORT = Number(process.env.TIEAI_TEST_PORT) || 3100;
const ORIGIN = `http://localhost:${PORT}`;
const START_PAGE = `${ORIGIN}/projects`;
const BACKGROUND = "#131112";

app.setName("Tiê AI");
if (process.env.TIEAI_TEST_DATA)
	app.setPath("userData", process.env.TIEAI_TEST_DATA);
app.setAppUserModelId("dev.tieai.desktop");

// The editor's build, made by build-web.js. Packaged, it travels in the app's
// resources; from the repository, it is next to the editor's code.
const WEB_DIR = app.isPackaged
	? path.join(process.resourcesPath, "web")
	: path.resolve(__dirname, "../web/.next-desktop/standalone/apps/web");
const SERVER_JS = path.join(WEB_DIR, "server.js");
const MIGRATIONS_DIR = path.join(WEB_DIR, "migrations");

const DATA_DIR = app.getPath("userData");
const DB_DIR = path.join(DATA_DIR, "db");
const LOG_FILE = path.join(DATA_DIR, "editor.log");
// A copy of the projects on its way from Edge (see apps/web/src/app/migrar)
const MIGRATION_DIR = path.join(DATA_DIR, "migration");
// The launcher of the Docker setup keeps its editor's process here
const LAUNCHER_STATE = path.join(
	process.env.LOCALAPPDATA || "",
	"OpenCut-AI",
	"launcher.json",
);

let server = null;
let mainWindow = null;

// One app at a time: a second click on the icon brings this window forward
if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on("second-instance", () => {
		if (!mainWindow) return;
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	});
	app.whenReady().then(start);
}

/** The secret that signs logins, made once per computer. */
function authSecret() {
	const file = path.join(DATA_DIR, "auth-secret");
	try {
		return fs.readFileSync(file, "utf8").trim();
	} catch {
		const secret = crypto.randomBytes(32).toString("hex");
		fs.mkdirSync(DATA_DIR, { recursive: true });
		fs.writeFileSync(file, secret, { mode: 0o600 });
		return secret;
	}
}

function portIsFree(port) {
	return new Promise((resolve) => {
		const probe = net.createServer();
		probe.once("error", () => resolve(false));
		probe.once("listening", () => probe.close(() => resolve(true)));
		probe.listen(port, "127.0.0.1");
	});
}

/**
 * The port is ours by design. When the editor the Docker launcher started is
 * on it, that one is stopped: it serves the same editor in the browser.
 */
async function freePort() {
	if (await portIsFree(PORT)) return true;
	try {
		const state = JSON.parse(
			fs.readFileSync(LAUNCHER_STATE, "utf8").replace(/^﻿/, ""),
		);
		if (state?.pid) {
			await new Promise((resolve) =>
				execFile("taskkill", ["/PID", String(state.pid), "/T", "/F"], () =>
					resolve(),
				),
			);
			for (let i = 0; i < 40; i++) {
				if (await portIsFree(PORT)) return true;
				await new Promise((resolve) => setTimeout(resolve, 250));
			}
		}
	} catch {
		// No launcher state: something else holds the port
	}
	return portIsFree(PORT);
}

function startServer() {
	fs.mkdirSync(DB_DIR, { recursive: true });
	const log = fs.openSync(LOG_FILE, "w");
	server = spawn(process.execPath, [SERVER_JS], {
		cwd: WEB_DIR,
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: "1",
			NODE_ENV: "production",
			NEXT_TELEMETRY_DISABLED: "1",
			PORT: String(PORT),
			HOSTNAME: "127.0.0.1",
			OPENCUT_DESKTOP: "1",
			OPENCUT_DB_DIR: DB_DIR,
			OPENCUT_MIGRATIONS_DIR: MIGRATIONS_DIR,
			OPENCUT_MIGRATION_DIR: MIGRATION_DIR,
			// Required by the env schema; the embedded database ignores it
			DATABASE_URL: "postgresql://embedded/tieai",
			BETTER_AUTH_SECRET: authSecret(),
		},
		stdio: ["ignore", log, log],
		windowsHide: true,
	});
	server.on("exit", (code) => {
		server = null;
		if (code && !app.isQuitting) {
			dialog.showErrorBox(
				"A Tiê AI parou",
				`O editor fechou com o código ${code}. Os detalhes estão em:\n${LOG_FILE}`,
			);
			app.quit();
		}
	});
}

function answers(url) {
	return new Promise((resolve) => {
		const request = http.get(url, (response) => {
			response.resume();
			resolve(response.statusCode === 200);
		});
		request.on("error", () => resolve(false));
		request.setTimeout(2000, () => {
			request.destroy();
			resolve(false);
		});
	});
}

async function waitForServer() {
	for (let i = 0; i < 240; i++) {
		if (await answers(`http://127.0.0.1:${PORT}/api/health`)) return true;
		if (!server) return false;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	return false;
}

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 1024,
		minHeight: 640,
		title: "Tiê AI",
		icon: path.join(__dirname, "icon.png"),
		backgroundColor: BACKGROUND,
		autoHideMenuBar: true,
		show: false,
		webPreferences: {
			contextIsolation: true,
			sandbox: true,
			spellcheck: false,
		},
	});
	mainWindow.maximize();
	mainWindow.once("ready-to-show", () => mainWindow.show());

	// Anything outside the editor (GitHub, OpenRouter, docs) opens in the
	// user's own browser
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		// The page that sends the projects runs in Edge, which holds them
		if (url.startsWith(`${ORIGIN}/migrar`)) openInEdge(url);
		else if (!url.startsWith(ORIGIN)) shell.openExternal(url);
		return { action: "deny" };
	});
	mainWindow.webContents.on("will-navigate", (event, url) => {
		if (!url.startsWith(ORIGIN)) {
			event.preventDefault();
			shell.openExternal(url);
		}
	});
	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

/** Edge, where the Docker launcher kept the projects; the default browser otherwise. */
function openInEdge(url) {
	const candidates = [
		path.join(
			process.env["ProgramFiles(x86)"] || "",
			"Microsoft",
			"Edge",
			"Application",
			"msedge.exe",
		),
		path.join(
			process.env.ProgramFiles || "",
			"Microsoft",
			"Edge",
			"Application",
			"msedge.exe",
		),
	];
	const edge = candidates.find((file) => fs.existsSync(file));
	if (edge) {
		spawn(edge, [url], { detached: true, stdio: "ignore" }).unref();
	} else {
		shell.openExternal(url);
	}
}

/** A short page in the window while the editor starts. */
function showStarting() {
	const page = `<!doctype html><meta charset="utf-8"><title>Tiê AI</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:${BACKGROUND};color:#9a9496;font:14px system-ui,sans-serif">
<div style="text-align:center"><div style="color:#ff4658;font:600 28px system-ui;letter-spacing:-.02em">Tiê AI</div>
<p style="margin-top:12px">Abrindo o editor…</p></div></body>`;
	mainWindow.loadURL(
		`data:text/html;charset=utf-8,${encodeURIComponent(page)}`,
	);
}

async function start() {
	Menu.setApplicationMenu(null);

	// The editor records voice for cloning and narration
	session.defaultSession.setPermissionRequestHandler(
		(contents, permission, grant) => {
			const fromEditor = contents.getURL().startsWith(ORIGIN);
			grant(
				fromEditor &&
					[
						"media",
						"clipboard-read",
						"clipboard-sanitized-write",
						"fullscreen",
					].includes(permission),
			);
		},
	);

	if (!fs.existsSync(SERVER_JS)) {
		dialog.showErrorBox(
			"Tiê AI",
			`O editor ainda não foi preparado para o app. Rode:\nnode apps/desktop/build-web.js\n\n(${SERVER_JS})`,
		);
		app.quit();
		return;
	}

	createWindow();
	showStarting();

	if (!(await freePort())) {
		dialog.showErrorBox(
			"Tiê AI",
			`A porta ${PORT} está em uso por outro programa, e a Tiê AI precisa dela para achar os seus projetos.`,
		);
		app.quit();
		return;
	}

	startServer();
	if (!(await waitForServer())) {
		if (server) {
			dialog.showErrorBox(
				"Tiê AI",
				`O editor não respondeu a tempo. Os detalhes estão em:\n${LOG_FILE}`,
			);
		}
		app.quit();
		return;
	}
	if (mainWindow) mainWindow.loadURL(START_PAGE);
}

function stopServer() {
	if (!server) return;
	const pid = server.pid;
	server = null;
	// The whole tree: Next.js may start workers of its own
	execFile("taskkill", ["/PID", String(pid), "/T", "/F"], () => {});
}

app.on("before-quit", () => {
	app.isQuitting = true;
	stopServer();
});
app.on("window-all-closed", () => app.quit());
