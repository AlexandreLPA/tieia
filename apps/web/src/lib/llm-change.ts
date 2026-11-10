/**
 * The chat model can be changed from several places (the picker in each chat,
 * "Gerenciar serviços de IA"). Whoever changes it says so here, and whoever
 * shows it listens, so no place keeps showing the previous model.
 */
const LLM_CHANGED = "tieai:llm-changed";

export function notifyLlmChanged(): void {
	window.dispatchEvent(new Event(LLM_CHANGED));
}

/** Returns the function that stops listening. */
export function onLlmChanged(listener: () => void): () => void {
	window.addEventListener(LLM_CHANGED, listener);
	return () => window.removeEventListener(LLM_CHANGED, listener);
}
