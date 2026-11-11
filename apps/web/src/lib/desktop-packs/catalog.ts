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
	{
		id: "tts",
		name: "Vozes prontas",
		description:
			"Narra o seu texto com vozes prontas, sem gravar a sua (Coqui XTTS, em português e outros 15 idiomas). Usa a placa de vídeo.",
		size: "cerca de 8 GB, mais 1,8 GB do modelo no primeiro uso",
		python: "3.11",
		requirements: ["tts-service/requirements.txt"],
		// requirements.txt keeps torch below 2.6 (CPU, for Docker), which has
		// no kernels for RTX 50 cards; 2.8 for CUDA 12.8 runs them
		overrides: ["tts-service/overrides-desktop.txt"],
		indexUrls: ["https://download.pytorch.org/whl/cu128"],
		services: [
			{
				id: "tts",
				dir: "tts-service",
				args: [
					"-m",
					"uvicorn",
					"app:app",
					"--host",
					"127.0.0.1",
					"--port",
					"8422",
				],
				port: 8422,
				health: "/health",
				// The model loads on the first use, not with the app; Coqui
				// asks to accept its license (CPML) before downloading XTTS.
				// coqui-tts 0.24 predates torch 2.6, which opens checkpoints
				// with weights_only and refuses XTTS's config objects; this
				// service only opens Coqui's own model files, which the Docker
				// image (torch 2.5) opens the same way
				env: {
					TTS_AUTOLOAD: "false",
					COQUI_TOS_AGREED: "1",
					TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD: "1",
				},
			},
		],
	},
	{
		id: "speaker",
		name: "Falantes",
		description:
			"Descobre quem fala em cada trecho (legendas por falante, editar por falante, cortes de podcast) e a emoção da fala.",
		size: "cerca de 5 GB, mais 0,5 GB dos modelos no primeiro uso",
		python: "3.11",
		requirements: ["speaker-service/requirements.txt"],
		// PyTorch for CUDA 12.8, at the version the Docker image locks
		overrides: ["speaker-service/overrides-desktop.txt"],
		indexUrls: ["https://download.pytorch.org/whl/cu128"],
		services: [
			{
				id: "speaker",
				dir: "speaker-service",
				args: [
					"-m",
					"uvicorn",
					"app:app",
					"--host",
					"127.0.0.1",
					"--port",
					"8424",
				],
				port: 8424,
				health: "/health",
			},
		],
	},
	{
		id: "face",
		name: "Rosto",
		description:
			"Acha os rostos no vídeo para reenquadrar sozinho (16:9 para 9:16) e manter quem fala no centro. Roda no processador.",
		size: "cerca de 0,5 GB",
		python: "3.11",
		requirements: ["face-service/requirements.txt"],
		services: [
			{
				id: "face",
				dir: "face-service",
				args: [
					"-m",
					"uvicorn",
					"app:app",
					"--host",
					"127.0.0.1",
					"--port",
					"8425",
				],
				port: 8425,
				health: "/health",
			},
		],
	},
	{
		id: "search",
		name: "Tradução e busca",
		description:
			"Traduz textos e legendas entre 200 idiomas (NLLB) e acha cenas pelo que aparece nelas (CLIP). Usa a placa de vídeo.",
		size: "cerca de 6 GB, mais 3 GB dos modelos no primeiro uso",
		python: "3.11",
		// One environment for both: they take the same torch
		requirements: [
			"translate-service/requirements.txt",
			"clip-service/requirements.txt",
		],
		// PyTorch for CUDA 12.8, the build the other GPU packs use
		overrides: ["translate-service/overrides-desktop.txt"],
		indexUrls: ["https://download.pytorch.org/whl/cu128"],
		services: [
			{
				id: "translate",
				dir: "translate-service",
				args: [
					"-m",
					"uvicorn",
					"app:app",
					"--host",
					"127.0.0.1",
					"--port",
					"8427",
				],
				port: 8427,
				health: "/health",
				env: { DEVICE: "auto" },
			},
			{
				id: "clip",
				dir: "clip-service",
				args: [
					"-m",
					"uvicorn",
					"app:app",
					"--host",
					"127.0.0.1",
					"--port",
					"8426",
				],
				port: 8426,
				health: "/health",
				env: { DEVICE: "auto" },
			},
		],
	},
	{
		id: "turboquant",
		name: "Chat local (TurboQuant)",
		description:
			"Roda modelos de chat no seu PC, sem internet (Qwen, Llama, Gemma e outros do Hugging Face), comprimidos para caber na placa de vídeo. Também responde quando o modelo da nuvem falha.",
		size: "cerca de 6 GB, mais o modelo escolhido",
		python: "3.11",
		requirements: ["turboquant-service/requirements.txt"],
		// PyTorch for CUDA 12.8, the build the other GPU packs use
		overrides: ["turboquant-service/overrides-desktop.txt"],
		indexUrls: ["https://download.pytorch.org/whl/cu128"],
		services: [
			{
				id: "turboquant",
				dir: "turboquant-service",
				args: [
					"-m",
					"uvicorn",
					"app:app",
					"--host",
					"127.0.0.1",
					"--port",
					"8430",
				],
				port: 8430,
				health: "/health",
				// The smallest model, as in Docker: it loads with the app only
				// once downloaded
				env: { MODEL_NAME: "Qwen/Qwen2.5-0.5B-Instruct", DEVICE: "auto" },
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
