export interface MusicGenParams {
	prompt: string;
	genre: string;
	mood: string;
	tempo: "slow" | "medium" | "fast";
	duration: number;
	instrumental: boolean;
}

export interface MusicGenResult {
	audioUrl: string;
	duration: number;
	waveformPeaks: number[];
	title: string;
}

// NOTE: genre names are kept in English on purpose. They are sent as literal
// prompt/style keywords to the music generation model, Brazilian streaming
// platforms (Spotify, YouTube Music, etc.) display these same genre tags in
// English, and a few (Lo-fi Hip Hop, Synthwave, Trap, Drum & Bass) have no
// natural Portuguese equivalent that wouldn't confuse a Brazilian editor.
export const MUSIC_GENRES = [
	"Cinematic",
	"Electronic",
	"Lo-fi Hip Hop",
	"Ambient",
	"Acoustic",
	"Pop",
	"Rock",
	"Jazz",
	"Classical",
	"R&B",
	"Folk",
	"Synthwave",
	"Trap",
	"Drum & Bass",
	"Chillout",
] as const;

export const MUSIC_MOODS = [
	"Feliz",
	"Triste",
	"Enérgico",
	"Calmo",
	"Dramático",
	"Misterioso",
	"Romântico",
	"Épico",
	"Divertido",
	"Sombrio",
	"Inspirador",
	"Nostálgico",
] as const;

export const MUSIC_TEMPOS = {
	slow: { label: "Lento", bpm: "60-80" },
	medium: { label: "Médio", bpm: "80-120" },
	fast: { label: "Rápido", bpm: "120-160" },
} as const;

export const DEFAULT_MUSIC_PARAMS: MusicGenParams = {
	prompt: "",
	genre: "Lo-fi Hip Hop",
	mood: "Calmo",
	tempo: "medium",
	duration: 30,
	instrumental: true,
};
