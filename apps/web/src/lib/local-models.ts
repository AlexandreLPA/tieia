import { create } from "zustand";
import { SERVICE_URLS } from "@/hooks/use-service-health";

/**
 * The models a local AI service downloads on its own (image, transcription):
 * what each needs, what is already on this PC, and the one picked. Each
 * service gets one store, shared by the place the model is used and by the
 * disk space list in "Configuração de IA".
 */

export interface LocalModel {
	name: string;
	/** The service's English description; screens show their own text */
	description: string;
	/** What the download weighs (an estimate from the service's list) */
	size_mb: number;
	/** Video memory the model needs to run on the card */
	vram_gb: number;
	/** "cpu": runs at a fair pace without a card; "gpu": made for one */
	device: string;
	/** All of it is on this PC */
	downloaded: boolean;
	/** How much is on this PC, during a download too */
	downloaded_mb: number;
	/** Loaded in the service right now */
	active: boolean;
	/** Being downloaded or loaded right now */
	loading: boolean;
	default_steps?: number;
}

export interface GraphicsCard {
	name: string;
	vram_gb: number;
}

export type LocalService = "image" | "whisper";

interface LocalModelsState {
	models: LocalModel[];
	gpu: GraphicsCard | null;
	recommended: string | null;
	/** The model the user picked (kept between sessions) */
	selected: string | null;
	/** Why the list could not be read */
	error: string | null;
	/** The model being downloaded from this screen */
	downloading: string | null;
	refresh: () => Promise<void>;
	select: (name: string) => void;
	/**
	 * Downloads (on the first use) and loads a model, polling the list so the
	 * screens show how far it got. Throws with the service's reason.
	 */
	download: (
		name: string,
		onProgress?: (model: LocalModel) => void,
	) => Promise<void>;
	/** Deletes a model's files (the service unloads it first). */
	remove: (name: string) => Promise<void>;
}

const LOAD_PARAM: Record<LocalService, string> = {
	image: "model_name",
	whisper: "model_size",
};

function readChoice(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function saveChoice(key: string, name: string) {
	try {
		localStorage.setItem(key, name);
	} catch {
		// The pick still holds until the editor closes
	}
}

async function reason(response: Response, fallback: string): Promise<string> {
	const body = (await response.json().catch(() => null)) as {
		detail?: string;
	} | null;
	return body?.detail || fallback;
}

function createLocalModelStore(service: LocalService) {
	const base = SERVICE_URLS[service];
	const choiceKey = `tie-ai:model:${service}`;

	return create<LocalModelsState>((set, get) => ({
		models: [],
		gpu: null,
		recommended: null,
		selected: null,
		error: null,
		downloading: null,

		refresh: async () => {
			try {
				const response = await fetch(`${base}/models`, {
					signal: AbortSignal.timeout(8000),
				});
				if (!response.ok) throw new Error(String(response.status));
				const data = (await response.json()) as {
					models?: LocalModel[];
					active_model?: string | null;
					gpu?: GraphicsCard | null;
					recommended?: string | null;
				};
				const models = data.models ?? [];
				const known = (name: string | null | undefined) =>
					name && models.some((model) => model.name === name) ? name : null;
				const downloaded = (name: string | null | undefined) =>
					models.find((model) => model.name === name && model.downloaded)
						?.name ?? null;
				// The user's pick; otherwise the loaded model or one already on
				// this PC (the recommended first), so nothing is downloaded
				// unasked; with none, the one suited to this PC
				const selected =
					known(get().selected) ??
					known(readChoice(choiceKey)) ??
					known(data.active_model) ??
					downloaded(data.recommended) ??
					models.find((model) => model.downloaded)?.name ??
					known(data.recommended) ??
					models[0]?.name ??
					null;
				set({
					models,
					gpu: data.gpu ?? null,
					recommended: data.recommended ?? null,
					selected,
					error: null,
				});
			} catch {
				set({ error: "O serviço não respondeu." });
			}
		},

		select: (name) => {
			saveChoice(choiceKey, name);
			set({ selected: name });
		},

		download: async (name, onProgress) => {
			set({ downloading: name });
			const poll = setInterval(async () => {
				await get().refresh();
				const model = get().models.find((entry) => entry.name === name);
				if (model) onProgress?.(model);
			}, 1500);
			try {
				const response = await fetch(
					`${base}/load?${LOAD_PARAM[service]}=${encodeURIComponent(name)}`,
					// The first use downloads the model: several GB
					{ method: "POST", signal: AbortSignal.timeout(2 * 60 * 60 * 1000) },
				);
				if (!response.ok) {
					throw new Error(
						await reason(response, "Não foi possível baixar o modelo."),
					);
				}
			} finally {
				clearInterval(poll);
				set({ downloading: null });
				await get().refresh();
			}
		},

		remove: async (name) => {
			const response = await fetch(
				`${base}/models/${encodeURIComponent(name)}`,
				{ method: "DELETE", signal: AbortSignal.timeout(60_000) },
			);
			if (!response.ok) {
				throw new Error(
					await reason(response, "Não foi possível apagar o modelo."),
				);
			}
			await get().refresh();
		},
	}));
}

export const useImageModels = createLocalModelStore("image");
export const useWhisperModels = createLocalModelStore("whisper");

/** "140 MB", "6,5 GB" */
export function formatSize(mb: number): string {
	if (mb < 1000) return `${Math.max(1, Math.round(mb))} MB`;
	const gb = mb / 1024;
	return `${gb.toLocaleString("pt-BR", { maximumFractionDigits: gb < 10 ? 1 : 0 })} GB`;
}

/**
 * Whether the model fits this PC, and if not why: shown under the model so
 * the user knows before downloading it.
 */
export function fitNote(
	model: LocalModel,
	gpu: GraphicsCard | null,
): string | null {
	if (!gpu) {
		return model.device === "gpu"
			? "Feito para placa de vídeo: sem uma, fica bem lento"
			: null;
	}
	if (model.vram_gb > gpu.vram_gb) {
		return `Precisa de ${model.vram_gb} GB de VRAM; a sua placa tem ${Math.round(gpu.vram_gb)} GB`;
	}
	return null;
}

/**
 * Loads the transcription model the user picked before a transcription
 * (downloading it on its first use); without this the service would use its
 * own default. A service that does not answer is left to the transcription
 * request, which reports the failure itself.
 */
export async function prepareWhisperModel(
	onProgress?: (text: string) => void,
): Promise<void> {
	const store = useWhisperModels.getState();
	await store.refresh();
	const { models, selected } = useWhisperModels.getState();
	const model = models.find((entry) => entry.name === selected);
	if (!model || model.active) return;
	onProgress?.(
		model.downloaded
			? `Carregando o modelo ${model.name}...`
			: `Baixando o modelo ${model.name} (${formatSize(model.size_mb)}), só desta vez...`,
	);
	await useWhisperModels.getState().download(model.name, (progress) => {
		onProgress?.(
			progress.downloaded
				? `Carregando o modelo ${model.name}...`
				: `Baixando o modelo ${model.name}: ${formatSize(progress.downloaded_mb)} de ${formatSize(model.size_mb)}...`,
		);
	});
}
