"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { aiClient } from "@/lib/ai-client";
import type { ReferenceAnalysis } from "@/types/ai";

/**
 * What the analysis would fix in a voice's recording, each one opt-in: tick
 * the fixes, hear before and after, then apply or leave it. Applying keeps
 * the original, so it can be undone.
 */
export function ReferenceFixes({
	voiceName,
	analysis,
	improved,
	onApplied,
	onRestored,
	compact = false,
}: {
	voiceName: string;
	analysis: ReferenceAnalysis;
	/** The saved recording already has fixes applied */
	improved: boolean;
	onApplied: (analysis: ReferenceAnalysis) => void;
	onRestored: () => void;
	/** Inside the narrow panel: smaller type */
	compact?: boolean;
}) {
	const [chosen, setChosen] = useState<string[]>(() => analysis.fixes.map((fix) => fix.id));
	const [preview, setPreview] = useState<{ before: string; after: string } | null>(null);
	const [busy, setBusy] = useState<"preview" | "apply" | "restore" | null>(null);

	// A new analysis (after applying) brings its own suggestions
	useEffect(() => {
		setChosen(analysis.fixes.map((fix) => fix.id));
		setPreview(null);
	}, [analysis]);

	useEffect(
		() => () => {
			if (preview) {
				URL.revokeObjectURL(preview.before);
				URL.revokeObjectURL(preview.after);
			}
		},
		[preview],
	);

	const text = compact ? "text-[10px]" : "text-xs";

	const handlePreview = async () => {
		setBusy("preview");
		try {
			const [before, after] = await Promise.all([
				aiClient.getChatterboxVoiceAudio(voiceName),
				aiClient.previewImprovedVoice(voiceName, chosen),
			]);
			setPreview({ before: URL.createObjectURL(before), after: URL.createObjectURL(after) });
		} catch (error) {
			toast.error("Não deu para preparar a prévia", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setBusy(null);
		}
	};

	const handleApply = async () => {
		setBusy("apply");
		try {
			const next = await aiClient.saveImprovedVoice(voiceName, chosen);
			onApplied(next);
			toast.success("Gravação ajustada", {
				description: "A original ficou guardada; dá para desfazer.",
			});
		} catch (error) {
			toast.error("Não foi possível ajustar a gravação", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setBusy(null);
		}
	};

	const handleRestore = async () => {
		setBusy("restore");
		try {
			await aiClient.restoreChatterboxVoice(voiceName);
			onRestored();
			toast.success("Gravação original de volta");
		} catch (error) {
			toast.error("Não foi possível desfazer", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setBusy(null);
		}
	};

	if (analysis.fixes.length === 0) {
		return improved ? (
			<div className="flex items-center justify-between gap-2 rounded-md border border-green-500/20 bg-green-500/5 px-2.5 py-1.5">
				<span className={`${text} text-green-600 dark:text-green-400`}>Gravação ajustada</span>
				<button
					type="button"
					className={`${text} text-muted-foreground hover:text-foreground hover:underline`}
					disabled={busy !== null}
					onClick={handleRestore}
				>
					{busy === "restore" ? "Desfazendo..." : "Desfazer"}
				</button>
			</div>
		) : null;
	}

	return (
		<div className="flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5">
			<p className={`${text} font-medium`}>
				Sugestões de ajuste{" "}
				<span className="font-normal text-muted-foreground">
					— nada muda até você aplicar
				</span>
			</p>
			{analysis.fixes.map((fix) => (
				<div key={fix.id} className="flex items-start gap-2">
					<Checkbox
						id={`fix-${voiceName}-${fix.id}`}
						checked={chosen.includes(fix.id)}
						onCheckedChange={(checked) => {
							setPreview(null);
							setChosen((current) =>
								checked === true
									? [...current, fix.id]
									: current.filter((id) => id !== fix.id),
							);
						}}
						className="mt-0.5"
					/>
					<label htmlFor={`fix-${voiceName}-${fix.id}`} className="flex cursor-pointer flex-col">
						<span className={`${text} font-medium`}>{fix.label}</span>
						<span className={`${compact ? "text-[9px]" : "text-[11px]"} text-muted-foreground`}>
							{fix.reason}
						</span>
					</label>
				</div>
			))}

			{preview && (
				<div className="flex flex-col gap-1">
					<span className="text-[10px] text-muted-foreground">Antes</span>
					<audio src={preview.before} controls className="h-7 w-full">
						<track kind="captions" />
					</audio>
					<span className="text-[10px] text-muted-foreground">Depois</span>
					<audio src={preview.after} controls autoPlay className="h-7 w-full">
						<track kind="captions" />
					</audio>
				</div>
			)}

			<div className="flex flex-wrap items-center gap-1.5">
				<Button
					size="sm"
					className="h-7 text-[11px]"
					disabled={chosen.length === 0 || busy !== null}
					onClick={handleApply}
				>
					{busy === "apply" && <Spinner className="mr-1 size-3" />}
					Aplicar {chosen.length > 1 ? `${chosen.length} ajustes` : "ajuste"}
				</Button>
				{!preview && (
					<Button
						size="sm"
						variant="outline"
						className="h-7 text-[11px]"
						disabled={chosen.length === 0 || busy !== null}
						onClick={handlePreview}
					>
						{busy === "preview" && <Spinner className="mr-1 size-3" />}
						Ouvir antes e depois
					</Button>
				)}
				{improved && (
					<button
						type="button"
						className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
						disabled={busy !== null}
						onClick={handleRestore}
					>
						Desfazer ajustes anteriores
					</button>
				)}
			</div>
		</div>
	);
}
