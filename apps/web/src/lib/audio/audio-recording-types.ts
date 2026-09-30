export interface AudioRecordingOptions {
	sampleRate: number;
	channelCount: number;
	monitoring: boolean;
	Countdown: number;
}

export const RECORDING_PRESETS = {
	studio: { sampleRate: 48000, channelCount: 1, label: "Estúdio (48kHz Mono)" },
	stereo: { sampleRate: 48000, channelCount: 2, label: "Estéreo (48kHz Estéreo)" },
	podcast: { sampleRate: 44100, channelCount: 1, label: "Podcast (44.1kHz Mono)" },
	voiceover: { sampleRate: 44100, channelCount: 1, label: "Locução (44.1kHz Mono)" },
} as const;
