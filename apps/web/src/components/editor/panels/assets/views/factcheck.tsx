"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { PanelView } from "./base-view";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranscriptStore } from "@/stores/transcript-store";
import { useEditor } from "@/hooks/use-editor";
import { aiClient } from "@/lib/ai-client";
import { DEFAULT_TEXT_ELEMENT } from "@/constants/text-constants";
import { cn } from "@/utils/ui";
import { toast } from "sonner";

interface Claim {
	claim: string;
	verdict: string;
	confidence: string;
	explanation: string;
	source: string;
}

interface FactCheckResult {
	claims: Claim[];
	summary: string;
}

const VERDICT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
	True: { bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400", label: "Verdadeiro" },
	False: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", label: "Falso" },
	"Partially True": { bg: "bg-yellow-500/10", text: "text-yellow-600 dark:text-yellow-400", label: "Parcial" },
	Unverifiable: { bg: "bg-muted", text: "text-muted-foreground", label: "Não verificável" },
};

function getVerdictStyle(verdict: string) {
	return VERDICT_STYLES[verdict] || VERDICT_STYLES.Unverifiable;
}

export function FactCheckView() {
	const [isChecking, setIsChecking] = useState(false);
	const [result, setResult] = useState<FactCheckResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const segments = useTranscriptStore((s) => s.segments);
	const editor = useEditor();

	const handleFactCheck = useCallback(async () => {
		if (segments.length === 0) {
			setError("Nenhuma transcrição disponível. Gere uma transcrição primeiro.");
			return;
		}

		const fullText = segments.map((s) => s.text).join(" ");
		if (fullText.trim().length < 10) {
			setError("O texto da transcrição é muito curto para verificação de fatos.");
			return;
		}

		setIsChecking(true);
		setError(null);
		setResult(null);

		try {
			const res = await aiClient.factCheck(fullText);
			setResult(res);
			if (res.claims.length === 0) {
				toast.info("Nenhuma afirmação verificável encontrada na transcrição.");
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Falha na verificação de fatos";
			if (msg.includes("Cannot connect") || msg.includes("503")) {
				setError("O backend de IA não está disponível. Verifique se ele está em execução.");
			} else {
				setError(msg);
			}
		} finally {
			setIsChecking(false);
		}
	}, [segments]);

	const handleAddOverlay = useCallback(
		(claim: Claim) => {
			const canvasSize = editor.project.getActive().settings.canvasSize;
			const currentTime = editor.playback.getCurrentTime();

			// Always create a new track for fact-check overlays
			const textTrackId = editor.timeline.addTrack({ type: "text", index: 0 });

			const verdictStyle = getVerdictStyle(claim.verdict);
			const overlayText = `${verdictStyle.label}: ${claim.claim}\n${claim.explanation}`;

			editor.timeline.insertElement({
				placement: { mode: "explicit", trackId: textTrackId },
				element: {
					...DEFAULT_TEXT_ELEMENT,
					name: `Verificação de Fatos`,
					content: overlayText,
					duration: 5,
					startTime: currentTime,
					fontSize: 12,
					fontWeight: "bold",
					color: "#ffffff",
					textAlign: "left",
					background: {
						enabled: true,
						color: claim.verdict === "False" ? "#dc2626" : claim.verdict === "True" ? "#16a34a" : "#ca8a04",
						cornerRadius: 6,
						paddingX: 14,
						paddingY: 10,
						offsetX: 0,
						offsetY: 0,
					},
					opacity: 0.95,
					transform: {
						scale: 1,
						position: { x: 0, y: canvasSize.height * 0.3 },
						rotate: 0,
					},
				},
			});

			toast.success("Sobreposição de verificação de fatos adicionada na posição do cursor de reprodução");
		},
		[editor],
	);

	const hasTranscript = segments.length > 0;

	return (
		<PanelView title="Verificação de Fatos">
			<div className="flex flex-col gap-4">
				<p className="text-xs text-muted-foreground leading-relaxed">
					Analise sua transcrição em busca de afirmações factuais e verifique-as. Adicione sobreposições de verificação de fatos ao seu vídeo.
				</p>

				{error && (
					<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
						<p className="text-destructive text-sm">{error}</p>
					</div>
				)}

				<Button
					className="w-full"
					onClick={handleFactCheck}
					disabled={isChecking || !hasTranscript}
				>
					{isChecking && <Spinner className="mr-1" />}
					{isChecking ? "Analisando afirmações..." : "Verificar fatos da transcrição"}
				</Button>

				{!hasTranscript && (
					<p className="text-xs text-muted-foreground text-center">
						Gere uma transcrição primeiro para habilitar a verificação de fatos.
					</p>
				)}

				{result && result.claims.length > 0 && (
					<div className="flex flex-col gap-3">
						<div className="rounded-md bg-muted/50 px-3 py-2">
							<p className="text-xs text-muted-foreground">{result.summary}</p>
						</div>

						{result.claims.map((claim) => {
							const style = getVerdictStyle(claim.verdict);
							return (
								<div
									key={claim.claim}
									className={cn(
										"rounded-md border p-3 flex flex-col gap-2",
										style.bg,
									)}
								>
									<div className="flex items-start justify-between gap-2">
										<p className="text-xs font-medium flex-1">
											&ldquo;{claim.claim}&rdquo;
										</p>
										<span
											className={cn(
												"shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
												style.bg,
												style.text,
											)}
										>
											{style.label}
										</span>
									</div>

									<p className="text-[11px] text-muted-foreground leading-relaxed">
										{claim.explanation}
									</p>

									{claim.source && (
										<p className="text-[10px] text-muted-foreground/70">
											Fonte: {claim.source}
										</p>
									)}

									<Button
										variant="outline"
										size="sm"
										className="self-start h-6 text-[10px]"
										onClick={() => handleAddOverlay(claim)}
									>
										Adicionar ao vídeo
									</Button>
								</div>
							);
						})}
					</div>
				)}

				{result && result.claims.length === 0 && (
					<div className="rounded-md bg-muted/50 px-3 py-4 text-center">
						<p className="text-xs text-muted-foreground">
							Nenhuma afirmação factual verificável encontrada na transcrição.
						</p>
					</div>
				)}
			</div>
		</PanelView>
	);
}
