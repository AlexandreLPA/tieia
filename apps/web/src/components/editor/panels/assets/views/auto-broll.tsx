"use client";

import { useCallback, useEffect, useState } from "react";
import { useEditor } from "@/hooks/use-editor";
import { useAutoBRoll, type BRollSuggestion } from "@/hooks/use-auto-broll";
import { useTranscriptStore } from "@/stores/transcript-store";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/ui";
import { getIndexedCount } from "@/services/search/embedding-store";
import { toast } from "sonner";

export function AutoBRollPanel() {
	const editor = useEditor();
	const segments = useTranscriptStore((s) => s.segments);
	const { run, indexAll, applyMatch, isRunning, progress, result } = useAutoBRoll();

	const [indexedCount, setIndexedCount] = useState(0);
	const [threshold, setThreshold] = useState(0.2);
	const [autoApply, setAutoApply] = useState(false);

	const assets = editor.media.getAssets();
	const indexableAssets = assets.filter((a) => a.type === "video" || a.type === "image").length;

	const refreshCount = useCallback(() => {
		getIndexedCount().then(setIndexedCount).catch(() => setIndexedCount(0));
	}, []);
	useEffect(() => {
		refreshCount();
		return editor.media.subscribe(() => setTimeout(refreshCount, 300));
	}, [editor.media, refreshCount]);

	const handleRun = useCallback(() => {
		if (indexedCount === 0) {
			toast.error("Indexe suas imagens primeiro.");
			return;
		}
		if (segments.length === 0) {
			toast.error("Transcreva sua mídia primeiro.");
			return;
		}
		run({ threshold, autoApply });
	}, [indexedCount, segments.length, run, threshold, autoApply]);

	return (
		<div className="flex flex-col gap-4 p-3">
			<div className="flex items-center justify-between">
				<span className="text-xs font-medium">Auto B-roll</span>
				<Badge variant="outline" className="text-[8px] px-1 py-0">
					Local · CLIP
				</Badge>
			</div>

			<p className="text-[10px] text-muted-foreground leading-relaxed">
				Compara cada segmento da transcrição com suas próprias imagens por
				similaridade visual e insere o melhor clipe como sobreposição. Toda a
				comparação roda no dispositivo, usando o índice CLIP local — sua mídia
				nunca sai da sua máquina.
			</p>

			{/* Index status */}
			<div className="flex items-center justify-between rounded-md border border-border px-2 py-1.5">
				<div className="flex flex-col">
					<span className="text-[10px] font-medium">Índice de imagens</span>
					<span className="text-[9px] text-muted-foreground">
						{indexedCount}/{indexableAssets} itens indexados
					</span>
				</div>
				<button
					type="button"
					disabled={isRunning || indexableAssets === 0}
					onClick={indexAll}
					className={cn(
						"rounded-md px-2 py-1 text-[9px] font-medium transition-colors",
						isRunning || indexableAssets === 0
							? "bg-muted text-muted-foreground cursor-not-allowed"
							: "bg-secondary hover:bg-secondary/80",
					)}
				>
					{isRunning ? "Indexando…" : "Indexar imagens"}
				</button>
			</div>

			{indexedCount === 0 && indexableAssets > 0 && (
				<div className="flex items-start gap-1 rounded-md border border-blue-500/30 bg-blue-500/5 px-2 py-1.5">
					<span className="text-[9px] text-blue-700 dark:text-blue-400 leading-relaxed">
						A indexação captura um quadro a cada ~2s por item e gera seu
						embedding. Isso roda uma vez; depois, a busca de B-roll é
						instantânea. O modelo CLIP tem ~340MB no primeiro uso.
					</span>
				</div>
			)}

			<div className="flex flex-col gap-1.5">
				<Label className="text-[10px]">
					Limite de correspondência: {threshold.toFixed(2)}
				</Label>
				<input
					type="range"
					min={0.1}
					max={0.4}
					step={0.02}
					value={threshold}
					disabled={isRunning}
					onChange={(e) => setThreshold(Number(e.target.value))}
					className="w-full accent-primary h-1"
				/>
				<span className="text-[8px] text-muted-foreground">
					Menor = mais correspondências (mais permissivo). Maior = menos
					correspondências, porém mais confiáveis.
				</span>
			</div>

			<label className="flex items-center gap-1.5 cursor-pointer">
				<input
					type="checkbox"
					checked={autoApply}
					disabled={isRunning}
					onChange={(e) => setAutoApply(e.target.checked)}
					className="size-3 accent-primary"
				/>
				<span className="text-[10px] text-muted-foreground">
					Aplicar automaticamente a melhor correspondência a cada segmento
				</span>
			</label>

			{progress && isRunning && (
				<div className="flex flex-col gap-1 rounded-md border border-primary/20 bg-primary/5 p-2">
					<div className="flex items-center justify-between">
						<span className="text-[9px] font-medium capitalize">{progress.phase}…</span>
						{progress.total > 0 && (
							<span className="text-[9px] text-muted-foreground">
								{progress.current}/{progress.total}
							</span>
						)}
					</div>
				</div>
			)}

			<button
				type="button"
				disabled={isRunning || indexedCount === 0 || segments.length === 0}
				onClick={handleRun}
				className={cn(
					"w-full rounded-md py-2 text-xs font-medium transition-colors",
					isRunning || indexedCount === 0 || segments.length === 0
						? "bg-muted text-muted-foreground cursor-not-allowed"
						: "bg-primary text-primary-foreground hover:bg-primary/90",
				)}
			>
				{isRunning ? "Comparando…" : "Gerar sugestões de B-roll"}
			</button>

			{/* Results: per-segment matches, reviewable */}
			{result && result.suggestions.length > 0 && !autoApply && (
				<div className="flex flex-col gap-2 mt-1">
					<div className="flex items-center justify-between">
						<span className="text-[10px] font-medium">
							{result.matched}/{result.suggestions.length} segmentos correspondidos
						</span>
					</div>
					<div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
						{result.suggestions.map((s) => (
							<SuggestionRow
								key={s.segmentIndex}
								suggestion={s}
								onApply={(match) => {
									applyMatch(match, s.start, s.end);
									toast.success("B-roll adicionado");
								}}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function SuggestionRow({
	suggestion,
	onApply,
}: {
	suggestion: BRollSuggestion;
	onApply: (m: BRollSuggestion["matches"][number]) => void;
}) {
	if (suggestion.matches.length === 0) return null;
	return (
		<div className="rounded-md border border-border p-2 flex flex-col gap-1.5">
			<div className="flex items-center gap-1.5">
				<Badge variant="secondary" className="text-[8px] px-1 py-0 shrink-0">
					{suggestion.start.toFixed(1)}s
				</Badge>
				<span className="text-[9px] text-muted-foreground truncate flex-1">
					{suggestion.text.slice(0, 60)}
				</span>
			</div>
			<div className="flex flex-col gap-1">
				{suggestion.matches.slice(0, 3).map((m) => (
					<button
						key={`${m.mediaId}-${m.timestampSec}`}
						type="button"
						onClick={() => onApply(m)}
						className="flex items-center gap-1.5 rounded border border-border hover:border-primary/40 hover:bg-accent px-1.5 py-1 transition-colors text-left"
					>
						{m.thumbnailUrl ? (
							// eslint-disable-next-line @next/next/no-img-element
							<img
								src={m.thumbnailUrl}
								alt=""
								className="size-8 rounded object-cover shrink-0"
							/>
						) : (
							<div className="size-8 rounded bg-muted shrink-0" />
						)}
						<div className="flex flex-col min-w-0 flex-1">
							<span className="text-[9px] truncate">{m.mediaName}</span>
							<span className="text-[8px] text-muted-foreground">
								@ {m.timestampSec.toFixed(1)}s · {Math.round(m.score * 100)}%
							</span>
						</div>
					</button>
				))}
			</div>
		</div>
	);
}
