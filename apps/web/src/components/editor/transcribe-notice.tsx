"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ClosedCaptionIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useStartTranscription } from "@/hooks/use-start-transcription";
import { useTranscriptStore } from "@/stores/transcript-store";
import { cn } from "@/utils/ui";

interface TranscribeNoticeProps {
	/** Why the transcript matters here, shown before the action */
	description: string;
	/** Single-line chip for tight spaces (chat input) instead of a card */
	compact?: boolean;
	className?: string;
}

/**
 * Shown while the project has no transcript: explains why it matters and
 * starts the transcription in place. Renders nothing once segments exist.
 */
export function TranscribeNotice({
	description,
	compact = false,
	className,
}: TranscribeNoticeProps) {
	const hasTranscript = useTranscriptStore((s) => s.segments.length > 0);
	const requested = useTranscriptStore((s) => s.transcriptionRequested);
	const { running, error } = useTranscriptStore((s) => s.captionsTranscription);
	const startTranscription = useStartTranscription();

	if (hasTranscript) return null;
	const isBusy = running || requested;

	if (compact) {
		return (
			<button
				type="button"
				onClick={startTranscription}
				disabled={isBusy}
				title={error ?? description}
				className={cn(
					"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors",
					isBusy
						? "border-border text-muted-foreground"
						: "border-yellow-500/40 text-yellow-500 hover:bg-yellow-500/10",
					className,
				)}
			>
				{isBusy ? (
					<Spinner className="size-3" />
				) : (
					<HugeiconsIcon icon={ClosedCaptionIcon} className="size-3" />
				)}
				{isBusy
					? "Transcrevendo..."
					: error
						? "Transcrição falhou: tentar de novo"
						: "Sem transcrição: transcrever agora"}
			</button>
		);
	}

	return (
		<div
			className={cn(
				"rounded-lg border p-2.5 text-left text-xs space-y-2",
				isBusy
					? "border-border bg-muted/30"
					: error
						? "border-red-500/30 bg-red-500/5"
						: "border-yellow-500/30 bg-yellow-500/5",
				className,
			)}
		>
			{isBusy ? (
				<p className="flex items-center gap-2 text-muted-foreground">
					<Spinner className="size-3.5 shrink-0" />
					Transcrevendo o vídeo. Pode esperar aqui: este aviso some sozinho
					quando a transcrição terminar.
				</p>
			) : (
				<>
					<p className={error ? "text-red-400" : "text-yellow-400"}>
						{error ? `A transcrição falhou: ${error}` : description}
					</p>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							size="sm"
							variant="outline"
							className="h-7 gap-1.5 text-xs"
							onClick={startTranscription}
						>
							<HugeiconsIcon icon={ClosedCaptionIcon} className="size-3.5" />
							{error ? "Tentar de novo" : "Transcrever agora"}
						</Button>
						<span className="text-[11px] text-muted-foreground">
							Também fica em Legendas (ícone CC) na barra lateral.
						</span>
					</div>
				</>
			)}
		</div>
	);
}
