"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { aiClient } from "@/lib/ai-client";

/** The backend's own sentence when it sent one (`{"detail": "..."}`), not the raw error. */
function readableError(cause: unknown) {
	const fallback = "Não foi possível salvar a chave. Tente de novo.";
	if (!(cause instanceof Error)) return fallback;
	const body = cause.message.match(/\{[\s\S]*\}\s*$/)?.[0];
	if (body) {
		try {
			const detail = (JSON.parse(body) as { detail?: unknown }).detail;
			if (typeof detail === "string") return detail;
			// FastAPI's validation errors come as a list
			if (Array.isArray(detail)) return "Esta chave não parece completa.";
		} catch {
			// not JSON after all
		}
	}
	return cause.message || fallback;
}

/**
 * Where the OpenRouter key is typed: the first-run steps and
 * "Gerenciar serviços de IA". The backend checks the key with OpenRouter,
 * saves it on this computer and starts answering with the best free model.
 */
export function OpenRouterKeyForm({
	onSaved,
	onSkip,
	skipLabel = "Configurar depois",
}: {
	onSaved: (model: string) => void;
	/** Shows the second button when set */
	onSkip?: () => void;
	skipLabel?: string;
}) {
	const [key, setKey] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		const trimmed = key.trim();
		if (!trimmed || isSaving) return;
		setIsSaving(true);
		setError(null);
		try {
			const result = await aiClient.setOpenRouterKey(trimmed);
			setKey("");
			onSaved(result.current_model);
		} catch (cause) {
			setError(readableError(cause));
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<form
			onSubmit={handleSubmit}
			className="flex flex-col gap-3"
			data-ui-target="ai/openrouter-key"
		>
			<div className="flex flex-col gap-1.5">
				<label htmlFor="openrouter-key" className="text-xs font-medium">
					Chave da OpenRouter
				</label>
				<Input
					id="openrouter-key"
					type="password"
					autoComplete="off"
					spellCheck={false}
					value={key}
					onChange={(event) => setKey(event.target.value)}
					placeholder="sk-or-v1-..."
					disabled={isSaving}
					aria-invalid={error !== null}
					aria-describedby={error ? "openrouter-key-error" : undefined}
					className="text-sm"
				/>
				{error && (
					<p id="openrouter-key-error" className="text-destructive text-xs">
						{error}
					</p>
				)}
			</div>
			<div className="flex gap-2">
				{onSkip && (
					<Button
						type="button"
						variant="outline"
						onClick={onSkip}
						disabled={isSaving}
						className="flex-1"
					>
						{skipLabel}
					</Button>
				)}
				<Button
					type="submit"
					disabled={!key.trim() || isSaving}
					className="flex-1"
				>
					{isSaving ? <Spinner className="size-3.5" /> : "Confirmar"}
				</Button>
			</div>
		</form>
	);
}
