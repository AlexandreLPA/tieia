import { useState, useCallback } from "react";
import { aiClient, AIClientError } from "@/lib/ai-client";
import { useAIStore } from "@/stores/ai-store";
import type { CommandResult } from "@/types/ai";

function formatCommandError(error: unknown): string {
	if (error instanceof AIClientError) {
		switch (error.errorType) {
			case "connection_refused":
				return "Não é possível conectar ao back-end de IA. O servidor precisa estar em execução para os comandos de IA funcionarem.";
			case "timeout":
				return "O comando expirou. O LLM ainda pode estar carregando — tente novamente em instantes.";
			case "backend_error":
				return `Erro no back-end de IA: ${error.message}. Verifique se o Ollama está em execução com um modelo carregado.`;
			default:
				return error.message;
		}
	}
	return error instanceof Error ? error.message : "Falha na execução do comando";
}

export function useAICommand() {
	const [isExecuting, setIsExecuting] = useState(false);
	const [result, setResult] = useState<CommandResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	const addCommand = useAIStore((s) => s.addCommand);

	const executeCommand = useCallback(
		async (command: string, timelineState: unknown) => {
			setIsExecuting(true);
			setError(null);
			setResult(null);

			try {
				addCommand(command);

				const commandResult = await aiClient.executeCommand(
					command,
					timelineState,
				);

				setResult(commandResult);
				return commandResult;
			} catch (err) {
				const message = formatCommandError(err);
				setError(message);
				throw err;
			} finally {
				setIsExecuting(false);
			}
		},
		[addCommand],
	);

	const clearResult = useCallback(() => {
		setResult(null);
		setError(null);
	}, []);

	return {
		executeCommand,
		clearResult,
		isExecuting,
		result,
		error,
	};
}
