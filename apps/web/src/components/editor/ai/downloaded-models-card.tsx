"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
	formatSize,
	type LocalModel,
	useImageModels,
	useWhisperModels,
} from "@/lib/local-models";

interface Row {
	key: string;
	kind: string;
	model: LocalModel;
	remove: (name: string) => Promise<void>;
}

/**
 * The models on this PC, with what each takes and a button to delete it, so
 * space goes only to what is used. Picking and downloading happen where each
 * model is used (Legendas, Tiê Image); here they are only freed.
 */
export function DownloadedModelsCard() {
	const image = useImageModels();
	const whisper = useWhisperModels();
	const [asking, setAsking] = useState<string | null>(null);
	const [removing, setRemoving] = useState<string | null>(null);

	const refreshImage = image.refresh;
	const refreshWhisper = whisper.refresh;
	useEffect(() => {
		refreshImage();
		refreshWhisper();
	}, [refreshImage, refreshWhisper]);

	const rows: Row[] = [
		...whisper.models.map((model) => ({
			key: `whisper:${model.name}`,
			kind: "Transcrição",
			model,
			remove: whisper.remove,
		})),
		...image.models.map((model) => ({
			key: `image:${model.name}`,
			kind: "Imagem",
			model,
			remove: image.remove,
		})),
	].filter(({ model }) => model.downloaded_mb > 0 && !model.loading);

	if (rows.length === 0) return null;
	const total = rows.reduce((sum, row) => sum + row.model.downloaded_mb, 0);

	const confirm = async (row: Row) => {
		setAsking(null);
		setRemoving(row.key);
		try {
			await row.remove(row.model.name);
			toast.success(`${row.model.name} apagado`);
		} catch (cause) {
			toast.error(
				cause instanceof Error ? cause.message : "Falha ao apagar o modelo",
			);
		} finally {
			setRemoving(null);
		}
	};

	return (
		<div className="rounded-lg border px-3 py-2.5" data-ui-target="ai/disk">
			<div className="flex items-baseline justify-between gap-3">
				<p className="text-sm font-medium">Espaço em disco</p>
				<span className="text-muted-foreground text-xs">
					{formatSize(total)} em modelos
				</span>
			</div>
			<p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
				Os modelos baixados neste PC. Apagar libera o espaço; se você usar o
				modelo de novo, ele baixa outra vez.
			</p>
			<div className="mt-2 flex flex-col gap-1">
				{rows.map((row) => (
					<div
						key={row.key}
						className="bg-muted/30 flex items-center gap-2 rounded px-2.5 py-1.5 text-xs"
					>
						<span className="min-w-0 flex-1 truncate">
							<span className="font-medium">{row.model.name}</span>
							<span className="text-muted-foreground"> · {row.kind}</span>
							{!row.model.downloaded && (
								<span className="text-muted-foreground"> · incompleto</span>
							)}
						</span>
						<span className="text-muted-foreground shrink-0">
							{formatSize(row.model.downloaded_mb)}
						</span>
						{removing === row.key ? (
							<Spinner className="size-3.5 shrink-0" />
						) : asking === row.key ? (
							<span className="flex shrink-0 items-center gap-1">
								<Button
									size="sm"
									variant="ghost"
									className="h-6 px-2 text-[11px]"
									onClick={() => setAsking(null)}
								>
									Cancelar
								</Button>
								<Button
									size="sm"
									variant="destructive"
									className="h-6 px-2 text-[11px]"
									onClick={() => confirm(row)}
								>
									Apagar
								</Button>
							</span>
						) : (
							<Button
								size="sm"
								variant="outline"
								className="h-6 shrink-0 px-2 text-[11px]"
								disabled={removing !== null}
								onClick={() => setAsking(row.key)}
							>
								Remover
							</Button>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
