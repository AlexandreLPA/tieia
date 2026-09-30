export interface LUFSMeasurement {
	integrated: number;
	shortTerm: number;
	momentary: number;
	truePeak: number;
	range: number;
}

export interface NormalizationConfig {
	targetLUFS: number;
	truePeakLimit: number;
	mode: "integrated" | "short-term" | "momentary";
}

export const LOUDNESS_PRESETS = [
	{ label: "YouTube", targetLUFS: -14, truePeakLimit: -1, desc: "Padrão do YouTube" },
	{ label: "Spotify", targetLUFS: -14, truePeakLimit: -1, desc: "Padrão do Spotify" },
	{ label: "Apple Podcasts", targetLUFS: -16, truePeakLimit: -1, desc: "Padrão da Apple" },
	{ label: "Broadcast (EBU R128)", targetLUFS: -23, truePeakLimit: -1, desc: "Radiodifusão da UE" },
	{ label: "Broadcast (ATSC A/85)", targetLUFS: -24, truePeakLimit: -2, desc: "Radiodifusão dos EUA" },
	{ label: "Streaming Geral", targetLUFS: -16, truePeakLimit: -1, desc: "Streaming em geral" },
	{ label: "Personalizado", targetLUFS: -16, truePeakLimit: -1, desc: "Alvo personalizado" },
] as const;

export const DEFAULT_NORMALIZATION: NormalizationConfig = {
	targetLUFS: -14,
	truePeakLimit: -1,
	mode: "integrated",
};
