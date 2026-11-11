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
	/** Settings of its own; the folder for its files is GENERATED_DIR */
	env?: Record<string, string>;
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
	/** Forced versions (uv's --override), relative to services/ */
	overrides?: string[];
	/** More package indexes, e.g. PyTorch's builds for a CUDA version */
	indexUrls?: string[];
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
	{
		id: "voice",
		name: "Voz clonada",
		description:
			"Clona uma voz a partir de 10 a 15 segundos de fala e narra o seu texto com ela (Chatterbox, em português e outros idiomas). Usa a placa de vídeo.",
		size: "cerca de 8 GB, mais 3 GB do modelo no primeiro uso",
		python: "3.11",
		requirements: ["chatterbox-service/requirements.txt"],
		// chatterbox-tts pins torch 2.6, which has no kernels for RTX 50
		// cards; 2.8 built for CUDA 12.8 runs them
		overrides: ["chatterbox-service/overrides.txt"],
		indexUrls: ["https://download.pytorch.org/whl/cu128"],
		services: [
			{
				id: "chatterbox",
				dir: "chatterbox-service",
				args: [
					"-m",
					"uvicorn",
					"app:app",
					"--host",
					"127.0.0.1",
					"--port",
					"8428",
				],
				port: 8428,
				health: "/health",
				env: { DEVICE: "auto" },
			},
		],
	},
	{
		id: "image",
		name: "Imagem",
		description:
			"Gera imagens a partir de uma descrição (Tiê Image) na placa de vídeo, e remove o fundo de imagens e vídeos.",
		size: "cerca de 5 GB, mais 6,5 GB do modelo e 1 GB da remoção de fundo no primeiro uso",
		python: "3.11",
		requirements: ["image-service/requirements.txt"],
		// PyTorch for CUDA 12.8 and the library versions the Docker image uses;
		// without them uv takes PyPI's newer, CPU-only torch
		overrides: ["image-service/overrides-desktop.txt"],
		indexUrls: ["https://download.pytorch.org/whl/cu128"],
		services: [
			{
				id: "image",
				dir: "image-service",
				args: [
					"-m",
					"uvicorn",
					"app:app",
					"--host",
					"127.0.0.1",
					"--port",
					"8423",
				],
				port: 8423,
				health: "/health",
				// What loads when a feature generates without picking a model
				// (B-roll, thumbnails); the service's own default, Stable
				// Diffusion 2.1, was taken down from Hugging Face
				env: { DIFFUSION_MODEL: "stabilityai/sdxl-turbo" },
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
