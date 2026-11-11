"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MigrationManifest } from "@/lib/desktop-migration/format";
import {
	importCopy,
	pendingCopy,
	type Progress,
} from "@/lib/desktop-migration/transfer";

const DISMISSED_KEY = "tieai:migration-card-dismissed";

type Status =
	| { kind: "hidden" }
	| { kind: "offer" }
	| { kind: "waiting" }
	| { kind: "importing"; progress: Progress }
	| { kind: "error"; message: string };

function readDismissed() {
	try {
		return localStorage.getItem(DISMISSED_KEY) === "1";
	} catch {
		return false;
	}
}

/**
 * In the desktop app only: brings in the projects the editor kept in Edge,
 * where the Docker launcher opened it. The button opens a page in Edge that
 * sends a copy; this card takes it in as soon as it arrives.
 */
export function DesktopMigrationCard({
	hasProjects,
}: {
	hasProjects: boolean;
}) {
	const [status, setStatus] = useState<Status>({ kind: "hidden" });
	const importing = useRef(false);

	const take = useCallback(async (manifest: MigrationManifest) => {
		if (importing.current) return;
		importing.current = true;
		try {
			await importCopy(manifest, (progress) =>
				setStatus({ kind: "importing", progress }),
			);
			localStorage.setItem(DISMISSED_KEY, "1");
			// The editor reads its projects once when it starts
			location.reload();
		} catch (error) {
			importing.current = false;
			setStatus({
				kind: "error",
				message: error instanceof Error ? error.message : "Erro desconhecido",
			});
		}
	}, []);

	// A copy already on disk is taken in right away
	useEffect(() => {
		if (!navigator.userAgent.includes("Electron")) return;
		pendingCopy()
			.then((manifest) => {
				if (manifest) take(manifest);
				else if (!readDismissed()) setStatus({ kind: "offer" });
			})
			.catch(() => {});
	}, [take]);

	// While Edge sends the copy, look for it every two seconds
	useEffect(() => {
		if (status.kind !== "waiting") return;
		const timer = setInterval(() => {
			pendingCopy()
				.then((manifest) => {
					if (manifest) take(manifest);
				})
				.catch(() => {});
		}, 2000);
		return () => clearInterval(timer);
	}, [status.kind, take]);

	if (status.kind === "hidden") return null;
	if (status.kind === "offer" && hasProjects) return null;

	const percent =
		status.kind === "importing" && status.progress.total > 0
			? Math.round((status.progress.done / status.progress.total) * 100)
			: 0;

	return (
		<section
			aria-live="polite"
			className="mx-4 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center"
		>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium">
					{status.kind === "importing"
						? "Trazendo seus projetos"
						: "Seus projetos estão no Edge?"}
				</p>
				<p className="text-muted-foreground mt-1 text-xs leading-relaxed">
					{status.kind === "offer" &&
						"O editor que abria pelo Docker guardava os projetos no Edge. Traga uma cópia deles para o app; nada é apagado de lá."}
					{status.kind === "waiting" &&
						"Abrimos uma página no Edge que envia a cópia. Deixe-a aberta; quando terminar, os projetos aparecem aqui."}
					{status.kind === "importing" &&
						`${status.progress.label}… ${percent}%`}
					{status.kind === "error" && `A cópia parou: ${status.message}`}
				</p>
				{status.kind === "importing" && (
					<div className="bg-secondary mt-2 h-1.5 overflow-hidden rounded-full">
						<div
							className="bg-primary h-full rounded-full transition-all duration-300"
							style={{ width: `${percent}%` }}
						/>
					</div>
				)}
			</div>
			{(status.kind === "offer" || status.kind === "error") && (
				<div className="flex shrink-0 gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							localStorage.setItem(DISMISSED_KEY, "1");
							setStatus({ kind: "hidden" });
						}}
					>
						Agora não
					</Button>
					<Button
						size="sm"
						onClick={() => {
							// The app opens this address in Edge, where the projects are
							window.open(`${location.origin}/migrar?from=app`, "_blank");
							setStatus({ kind: "waiting" });
						}}
					>
						Trazer do navegador
					</Button>
				</div>
			)}
		</section>
	);
}
