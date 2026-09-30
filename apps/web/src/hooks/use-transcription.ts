import { useState, useCallback } from "react";
import { aiClient, AIClientError } from "@/lib/ai-client";
import { useTranscriptStore } from "@/stores/transcript-store";

function formatTranscriptionError(error: unknown): string {
	if (error instanceof AIClientError) {
		switch (error.errorType) {
			case "connection_refused":
				return "Não é possível conectar ao back-end de IA. Inicie o servidor de back-end primeiro (veja Configuração de IA).";
			case "timeout":
				return "A solicitação de transcrição expirou. O modelo ainda pode estar carregando — tente novamente em instantes.";
			case "backend_error":
				return error.statusCode === 400
					? "Formato de arquivo inválido. Suportados: mp4, mkv, avi, mov, webm, wav, mp3, m4a, ogg, flac, aac."
					: `Erro no back-end: ${error.message}`;
			default:
				return error.message;
		}
	}
	return error instanceof Error ? error.message : "Falha na transcrição";
}

export function useTranscription() {
	const [error, setError] = useState<string | null>(null);

	const {
		isTranscribing,
		progress,
		setTranscribing,
		setProgress,
		setSegments,
		setLanguage,
	} = useTranscriptStore();

	const transcribeVideo = useCallback(
		async (file: File, language?: string) => {
			setError(null);
			setTranscribing(true);
			setProgress(0);

			try {
				setProgress(10);

				const result = await aiClient.transcribe(file, language);

				setSegments(result.segments);
				setLanguage(result.language);
				setProgress(100);

				return result;
			} catch (err) {
				const message = formatTranscriptionError(err);
				setError(message);
				throw err;
			} finally {
				setTranscribing(false);
			}
		},
		[setTranscribing, setProgress, setSegments, setLanguage],
	);

	const clearError = useCallback(() => {
		setError(null);
	}, []);

	return {
		transcribeVideo,
		isTranscribing,
		progress,
		error,
		clearError,
	};
}
