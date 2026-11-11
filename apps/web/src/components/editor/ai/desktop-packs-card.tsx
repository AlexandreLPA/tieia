"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { PackInfo } from "@/lib/desktop-packs/catalog";

const API = "/api/desktop/packs";

/**
 * In the desktop app: the AI packs, with a button to install each one. A pack
 * is a Python environment the app downloads once; its services then start
 * with the app, without Docker.
 */
export function DesktopPacksCard() {
	const [packs, setPacks] = useState<PackInfo[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			const response = await fetch(API, { cache: "no-store" });
			if (!response.ok) return;
			setPacks(((await response.json()) as { packs: PackInfo[] }).packs);
		} catch {
			// The app's server is restarting; the next poll tries again
		}
	}, []);

	useEffect(() => {
		if (!navigator.userAgent.includes("Electron")) return;
		refresh();
	}, [refresh]);

	// While a pack installs, follow its progress
	const busy = packs?.some((pack) => pack.state.status === "installing");
	useEffect(() => {
		if (!busy) return;
		const timer = setInterval(refresh, 1500);
		return () => clearInterval(timer);
	}, [busy, refresh]);

	const act = async (action: "install" | "start", id: string) => {
		setError(null);
		try {
			const response = await fetch(API, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action, id }),
			});
			if (!response.ok) throw new Error(await response.text());
			setPacks(((await response.json()) as { packs: PackInfo[] }).packs);
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Falha ao falar com o app",
			);
		}
	};

	if (!packs) return null;

	return (
		<div className="flex flex-col gap-2" data-ui-target="ai/packs">
			{packs.map((pack) => {
				const { state } = pack;
				return (
					<div key={pack.id} className="rounded-lg border px-3 py-2.5">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<p className="text-sm font-medium">{pack.name}</p>
								<p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
									{pack.description}
								</p>
							</div>
							{state.status === "not-installed" && (
								<Button
									size="sm"
									className="shrink-0"
									onClick={() => act("install", pack.id)}
								>
									Instalar
								</Button>
							)}
							{state.status === "error" && (
								<Button
									size="sm"
									variant="outline"
									className="shrink-0"
									onClick={() => act("install", pack.id)}
								>
									Tentar de novo
								</Button>
							)}
							{state.status === "installed" && !state.running && (
								<Button
									size="sm"
									variant="outline"
									className="shrink-0"
									onClick={() => act("start", pack.id)}
								>
									Ligar
								</Button>
							)}
						</div>
						<p
							className="text-muted-foreground mt-2 text-xs"
							aria-live="polite"
						>
							{state.status === "not-installed" &&
								`Roda no seu PC, sem Docker. Baixa ${pack.size} uma vez.`}
							{state.status === "installing" && (
								<span className="flex items-center gap-2">
									<Spinner className="size-3 shrink-0" />
									<span className="min-w-0 truncate">
										{state.step}
										{state.detail ? ` · ${state.detail}` : "…"}
									</span>
								</span>
							)}
							{state.status === "installed" &&
								(state.running
									? "Instalado e ligado."
									: "Instalado, mas desligado.")}
							{state.status === "error" && (
								<span className="text-destructive">
									A instalação parou: {state.message}
								</span>
							)}
						</p>
					</div>
				);
			})}
			{error && <p className="text-destructive text-xs">{error}</p>}
		</div>
	);
}
