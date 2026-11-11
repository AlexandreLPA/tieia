/**
 * The local AI of the desktop app, in packs: each one is a Python
 * environment of its own (the services pin different versions of the same
 * libraries) plus the services that run in it. A pack is downloaded the first
 * time the user wants what it brings.
 */

export interface PackService {
	id: string;
	/** Folder under services/ */
	dir: string;
	/** Arguments for the pack's Python */
	args: string[];
	port: number;
	/** Answers 200 once the service is up */
	health: string;
}

export interface Pack {
	id: string;
	name: string;
	/** What it gives the user, in their words */
	description: string;
	/** About how much it downloads, shown before installing */
	size: string;
	python: string;
	/** requirements files, relative to services/ */
	requirements: string[];
	/** Extra packages beyond the services' own */
	extras?: string[];
	services: PackService[];
}

export const PACKS: Pack[] = [
	{
		id: "base",
		name: "Base de IA",
		description:
			"O chat com os modelos da nuvem, a transcrição e legendas automáticas e os recursos de IA que não precisam de placa de vídeo.",
		size: "cerca de 2,5 GB",
		python: "3.11",
		requirements: [
			"ai-backend/requirements.txt",
			"whisper-service/requirements.txt",
		],
		services: [
			{
				id: "ai-backend",
				dir: "ai-backend",
				args: ["run.py"],
				port: 8420,
				health: "/health",
			},
			{
				id: "whisper",
				dir: "whisper-service",
				args: [
					"-m",
					"uvicorn",
					"app:app",
					"--host",
					"127.0.0.1",
					"--port",
					"8421",
				],
				port: 8421,
				health: "/health",
			},
		],
	},
];

export type PackState =
	| { status: "not-installed" }
	| { status: "installing"; step: string; detail: string }
	| { status: "installed"; running: boolean }
	| { status: "error"; message: string };

export interface PackInfo {
	id: string;
	name: string;
	description: string;
	size: string;
	state: PackState;
}
