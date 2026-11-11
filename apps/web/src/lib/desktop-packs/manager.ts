import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import {
	type Pack,
	type PackInfo,
	type PackService,
	type PackState,
	PACKS,
} from "./catalog";

/**
 * Installs and runs the desktop app's AI packs. Lives in the editor's server,
 * which the app starts and stops: the Python services are its children, so
 * they go away with it.
 */

const PACKS_DIR = process.env.OPENCUT_PACKS_DIR ?? "";
const SERVICES_DIR = process.env.OPENCUT_SERVICES_DIR ?? "";
/** Generated files, uploads, saved keys and downloaded models */
const AI_DATA_DIR = process.env.OPENCUT_AI_DATA_DIR ?? "";
const UV = process.env.OPENCUT_UV || "uv";
const EDITOR_ORIGIN = "http://localhost:3100";

interface Runtime {
	states: Map<string, PackState>;
	processes: Map<string, ChildProcess>;
	starting: Map<string, Promise<void>>;
}

// One registry per server process, even if Next.js loads this module twice
const holder = globalThis as unknown as { __tieaiPacks?: Runtime };
if (!holder.__tieaiPacks) {
	holder.__tieaiPacks = {
		states: new Map(),
		processes: new Map(),
		starting: new Map(),
	};
}
const runtime: Runtime = holder.__tieaiPacks;

export function packsAvailable() {
	return Boolean(PACKS_DIR && SERVICES_DIR && AI_DATA_DIR);
}

function packDir(pack: Pack) {
	return path.join(PACKS_DIR, pack.id);
}

function pythonOf(pack: Pack) {
	return path.join(packDir(pack), "venv", "Scripts", "python.exe");
}

/** Changes when the pack's requirements change, so an update reinstalls it. */
function fingerprint(pack: Pack) {
	const hash = createHash("sha256");
	hash.update(pack.python);
	for (const file of pack.requirements) {
		hash.update(readFileSync(path.join(SERVICES_DIR, file)));
	}
	for (const extra of pack.extras ?? []) hash.update(extra);
	for (const file of pack.overrides ?? []) {
		hash.update(readFileSync(path.join(SERVICES_DIR, file)));
	}
	for (const url of pack.indexUrls ?? []) hash.update(url);
	return hash.digest("hex").slice(0, 16);
}

function isInstalled(pack: Pack) {
	try {
		const marker = JSON.parse(
			readFileSync(path.join(packDir(pack), "installed.json"), "utf8"),
		) as { fingerprint?: string };
		return (
			marker.fingerprint === fingerprint(pack) && existsSync(pythonOf(pack))
		);
	} catch {
		return false;
	}
}

function stateOf(pack: Pack): PackState {
	const current = runtime.states.get(pack.id);
	if (current && current.status !== "installed") return current;
	if (!isInstalled(pack)) return { status: "not-installed" };
	const running = pack.services.every((service) =>
		runtime.processes.has(service.id),
	);
	return { status: "installed", running };
}

export function listPacks(): PackInfo[] {
	return PACKS.map((pack) => ({
		id: pack.id,
		name: pack.name,
		description: pack.description,
		size: pack.size,
		state: stateOf(pack),
	}));
}

/** Runs a command, reporting its last line of output as it goes. */
function run(
	command: string,
	args: string[],
	onLine: (line: string) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { windowsHide: true });
		let tail = "";
		const read = (chunk: Buffer) => {
			for (const line of chunk.toString().split(/\r?\n|\r/)) {
				const text = line.trim();
				if (text) {
					tail = text;
					onLine(text);
				}
			}
		};
		child.stdout.on("data", read);
		child.stderr.on("data", read);
		child.on("error", reject);
		child.on("exit", (code) =>
			code === 0
				? resolve()
				: reject(new Error(tail || `${command} saiu com o código ${code}`)),
		);
	});
}

/** Downloads Python and the pack's libraries; runs in the background. */
export function installPack(id: string) {
	const pack = PACKS.find((entry) => entry.id === id);
	if (!pack) throw new Error(`Pacote desconhecido: ${id}`);
	if (runtime.states.get(id)?.status === "installing") return;

	const set = (step: string, detail = "") =>
		runtime.states.set(id, { status: "installing", step, detail });

	const job = async () => {
		const dir = packDir(pack);
		await fs.rm(dir, { recursive: true, force: true });
		await fs.mkdir(dir, { recursive: true });

		set("Baixando o Python");
		await run(
			UV,
			["venv", "--python", pack.python, path.join(dir, "venv")],
			(line) => set("Baixando o Python", line),
		);

		set("Baixando as bibliotecas de IA");
		await run(
			UV,
			[
				"pip",
				"install",
				"--python",
				pythonOf(pack),
				...pack.requirements.flatMap((file) => [
					"-r",
					path.join(SERVICES_DIR, file),
				]),
				...(pack.extras ?? []),
				...(pack.overrides ?? []).flatMap((file) => [
					"--override",
					path.join(SERVICES_DIR, file),
				]),
				...(pack.indexUrls?.length
					? [
							// Take each package from whichever index has the wanted
							// build (PyTorch's for torch, PyPI for the rest)
							"--index-strategy",
							"unsafe-best-match",
							...pack.indexUrls.flatMap((url) => ["--extra-index-url", url]),
						]
					: []),
			],
			(line) => set("Baixando as bibliotecas de IA", line),
		);

		await fs.writeFile(
			path.join(dir, "installed.json"),
			JSON.stringify({
				fingerprint: fingerprint(pack),
				installedAt: new Date().toISOString(),
			}),
		);
		runtime.states.delete(id);
		await startPack(id);
	};

	set("Começando");
	job().catch((error: unknown) => {
		runtime.states.set(id, {
			status: "error",
			message: error instanceof Error ? error.message : String(error),
		});
	});
}

async function answers(url: string) {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
		return response.ok;
	} catch {
		return false;
	}
}

/** What the services need to run on this computer instead of in Docker. */
function serviceEnv(pack: Pack, service: PackService): NodeJS.ProcessEnv {
	const sitePackages = path.join(packDir(pack), "venv", "Lib", "site-packages");
	// ctranslate2 (transcription on the GPU) loads cuBLAS and cuDNN from PATH
	const cudaDirs = ["cublas", "cudnn"].map((lib) =>
		path.join(sitePackages, "nvidia", lib, "bin"),
	);
	const generated = path.join(AI_DATA_DIR, "generated");
	const secretsFile = path.join(AI_DATA_DIR, "secrets.json");
	// The app has no local chat model yet: with an OpenRouter key, the chat
	// starts on the cloud. A model picked in the editor still wins.
	const hasCloudKey =
		Boolean(process.env.OPENCUTAI_OPENROUTER_API_KEY) ||
		existsSync(secretsFile);
	const uploads = path.join(AI_DATA_DIR, "uploads");
	return {
		...process.env,
		PATH: [...cudaDirs, process.env.PATH ?? ""].join(path.delimiter),
		PYTHONUTF8: "1",
		PYTHONUNBUFFERED: "1",
		HF_HOME: path.join(AI_DATA_DIR, "models", "huggingface"),
		// Plain downloads grow the file as they go, so the model pickers can
		// show the progress; Xet writes each file only at the end
		HF_HUB_DISABLE_XET: "1",
		// Coqui's own models (XTTS), next to the Hugging Face ones
		TTS_HOME: path.join(AI_DATA_DIR, "models", "tts"),
		// rembg's background-removal models (default: a .u2net folder in home)
		U2NET_HOME: path.join(AI_DATA_DIR, "models", "rembg"),
		// AI backend
		OPENCUTAI_HOST: "127.0.0.1",
		OPENCUTAI_PORT: "8420",
		OPENCUTAI_CORS_ORIGINS: JSON.stringify([EDITOR_ORIGIN]),
		OPENCUTAI_GENERATED_DIR: generated,
		OPENCUTAI_UPLOAD_DIR: uploads,
		OPENCUTAI_SECRETS_FILE: secretsFile,
		...(hasCloudKey && { OPENCUTAI_AI_LLM_BACKEND: "openrouter" }),
		OPENCUTAI_WHISPER_SERVICE_URL: "http://127.0.0.1:8421",
		// Transcription: the GPU when it works, the CPU otherwise (the service
		// falls back on its own when CUDA fails)
		WHISPER_DEVICE: "cuda",
		UPLOAD_DIR: path.join(uploads, service.id),
		// Each service's own files (Chatterbox keeps the cloned voices here)
		GENERATED_DIR: path.join(AI_DATA_DIR, service.id),
		...service.env,
	};
}

/** Starts the pack's services that are not answering yet. */
export function startPack(id: string): Promise<void> {
	const pack = PACKS.find((entry) => entry.id === id);
	if (!pack || !isInstalled(pack)) return Promise.resolve();
	const pending = runtime.starting.get(id);
	if (pending) return pending;

	const job = (async () => {
		await fs.mkdir(path.join(AI_DATA_DIR, "logs"), { recursive: true });
		for (const service of pack.services) {
			const url = `http://127.0.0.1:${service.port}${service.health}`;
			// Already up: ours, or the Docker one during the migration
			if (runtime.processes.has(service.id) || (await answers(url))) continue;
			const log = await fs.open(
				path.join(AI_DATA_DIR, "logs", `${service.id}.log`),
				"w",
			);
			const child = spawn(pythonOf(pack), service.args, {
				cwd: path.join(SERVICES_DIR, service.dir),
				env: serviceEnv(pack, service),
				stdio: ["ignore", log.fd, log.fd],
				windowsHide: true,
			});
			runtime.processes.set(service.id, child);
			child.on("exit", () => {
				runtime.processes.delete(service.id);
				log.close().catch(() => {});
			});
			for (let i = 0; i < 120 && runtime.processes.has(service.id); i++) {
				if (await answers(url)) break;
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		}
	})().finally(() => runtime.starting.delete(id));
	runtime.starting.set(id, job);
	return job;
}

/** Starts every installed pack; called when the server starts. */
export async function startInstalledPacks() {
	if (!packsAvailable()) return;
	for (const pack of PACKS) {
		if (isInstalled(pack)) await startPack(pack.id).catch(() => {});
	}
}
