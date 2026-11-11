"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	exportBrowserStorage,
	type Progress,
} from "@/lib/desktop-migration/transfer";

type Status =
	| { kind: "idle" }
	| { kind: "running"; progress: Progress }
	| { kind: "done"; projects: number; files: number; bytes: number }
	| { kind: "error"; message: string };

function gigabytes(bytes: number) {
	if (bytes < 1024 ** 3)
		return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
	return `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} GB`;
}

/**
 * Opened by the desktop app in Edge, where the Docker launcher kept the
 * projects: it sends a copy of everything the editor stored in this browser
 * to the app. The browser keeps its own copy.
 */
export default function MigratePage() {
	const [status, setStatus] = useState<Status>({ kind: "idle" });
	const [inApp, setInApp] = useState(false);
	const started = useRef(false);

	const run = useCallback(async () => {
		if (started.current) return;
		started.current = true;
		setStatus({
			kind: "running",
			progress: { label: "Começando", done: 0, total: 1 },
		});
		try {
			const result = await exportBrowserStorage((progress) =>
				setStatus({ kind: "running", progress }),
			);
			setStatus({ kind: "done", ...result });
		} catch (error) {
			started.current = false;
			setStatus({
				kind: "error",
				message: error instanceof Error ? error.message : "Erro desconhecido",
			});
		}
	}, []);

	useEffect(() => {
		const electron = navigator.userAgent.includes("Electron");
		setInApp(electron);
		// Opened from the app's button: start without a second click
		if (!electron && new URLSearchParams(location.search).get("from") === "app")
			run();
	}, [run]);

	const percent =
		status.kind === "running" && status.progress.total > 0
			? Math.round((status.progress.done / status.progress.total) * 100)
			: 0;

	return (
		<main className="bg-background flex min-h-screen items-center justify-center px-6">
			<div className="flex w-full max-w-md flex-col gap-5">
				<div className="flex flex-col gap-2">
					<h1 className="text-2xl font-semibold tracking-tight">
						Levar seus projetos para o app
					</h1>
					<p className="text-muted-foreground text-sm leading-relaxed">
						Copia para o app da Tiê AI os projetos, vídeos, imagens e
						configurações que o editor guardou neste navegador. Nada é apagado
						daqui.
					</p>
				</div>

				{inApp ? (
					<p className="rounded-md bg-yellow-500/10 px-3 py-2 text-sm text-yellow-600 dark:text-yellow-500">
						Esta página precisa ser aberta no Edge, onde estão os projetos. Use
						o botão "Trazer do navegador" na lista de projetos do app.
					</p>
				) : status.kind === "idle" ? (
					<Button onClick={run} className="w-fit">
						Copiar para o app
					</Button>
				) : status.kind === "running" ? (
					<div className="flex flex-col gap-2" aria-live="polite">
						<div className="bg-secondary h-2 overflow-hidden rounded-full">
							<div
								className="bg-primary h-full rounded-full transition-all duration-300"
								style={{ width: `${percent}%` }}
							/>
						</div>
						<p className="text-muted-foreground text-sm">
							{status.progress.label}
							{status.progress.total > 1 &&
								` · ${gigabytes(status.progress.done)} de ${gigabytes(status.progress.total)}`}
						</p>
						<p className="text-muted-foreground text-xs">
							Deixe esta aba aberta até terminar.
						</p>
					</div>
				) : status.kind === "done" ? (
					<div className="flex flex-col gap-2" aria-live="polite">
						<p className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
							Pronto: {status.projects}{" "}
							{status.projects === 1 ? "projeto" : "projetos"} e {status.files}{" "}
							{status.files === 1 ? "arquivo" : "arquivos"} (
							{gigabytes(status.bytes)}) copiados.
						</p>
						<p className="text-muted-foreground text-sm">
							Pode fechar esta aba e voltar ao app: ele traz a cópia sozinho.
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-3" aria-live="polite">
						<p className="text-destructive text-sm leading-relaxed">
							A cópia parou: {status.message}
						</p>
						<p className="text-muted-foreground text-sm">
							Confira se o app da Tiê AI está aberto e tente de novo.
						</p>
						<Button onClick={run} variant="outline" className="w-fit">
							Tentar de novo
						</Button>
					</div>
				)}
			</div>
		</main>
	);
}
