"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, Inbox, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
	TIKTOK_UPLOAD_PAGE_URL,
	describeAspectRatio,
	isNineBySixteen,
} from "@/lib/tiktok/aspect";
import {
	TIKTOK_LOGIN_PATH,
	type TikTokSendOutcome,
	type TikTokSendProgress,
	TikTokSendError,
	disconnectTikTok,
	fetchTikTokAccount,
	sendVideoToTikTokInbox,
} from "@/lib/tiktok/client";
import { TIKTOK_CONNECT_CHANNEL } from "@/lib/tiktok/connect-result";
import type { TikTokAccountResponse } from "@/lib/tiktok/types";
import type { TCanvasSize } from "@/types/project";

type SendState =
	| { kind: "idle" }
	| { kind: "sending"; progress: TikTokSendProgress | null }
	| { kind: "done"; outcome: TikTokSendOutcome }
	| { kind: "error"; message: string; reconnect: boolean };

const DONE_MESSAGES: Record<TikTokSendOutcome, string> = {
	SEND_TO_USER_INBOX:
		"Pronto! Abra o app do TikTok, toque na notificação e poste.",
	PUBLISH_COMPLETE: "Esse vídeo já foi postado pelo app do TikTok.",
	STILL_PROCESSING:
		"Vídeo enviado. O TikTok ainda está processando; quando a notificação chegar no app, toque nela e poste.",
};

/**
 * "Enviar ao TikTok" after an export. Always offers the TikTok website; when
 * the server has TikTok keys, also sends straight to the app's inbox.
 */
export function SendToTikTok({
	video,
	filename,
	canvasSize,
	onDownloadAgain,
	onBusyChange,
}: {
	video: Blob;
	filename: string;
	canvasSize: TCanvasSize;
	onDownloadAgain: () => void;
	/** True while an inbox upload runs, so the popover can stay open. */
	onBusyChange?: (busy: boolean) => void;
}) {
	const isVertical = isNineBySixteen(canvasSize);
	const [account, setAccount] = useState<TikTokAccountResponse | null>(null);
	const [hasOpenedWebsite, setHasOpenedWebsite] = useState(false);
	const [send, setSend] = useState<SendState>({ kind: "idle" });
	const abortRef = useRef<AbortController | null>(null);

	const isSending = send.kind === "sending";
	useEffect(() => {
		onBusyChange?.(isSending);
	}, [isSending, onBusyChange]);

	const refreshAccount = useCallback(async () => {
		setAccount(await fetchTikTokAccount());
	}, []);

	useEffect(() => {
		refreshAccount();
		// The login finishes in another tab, which reports back on this channel.
		let channel: BroadcastChannel | null = null;
		try {
			channel = new BroadcastChannel(TIKTOK_CONNECT_CHANNEL);
			channel.onmessage = () => refreshAccount();
		} catch {
			channel = null;
		}
		window.addEventListener("focus", refreshAccount);
		return () => {
			channel?.close();
			window.removeEventListener("focus", refreshAccount);
			abortRef.current?.abort();
		};
	}, [refreshAccount]);

	const handleDisconnect = async () => {
		try {
			await disconnectTikTok();
		} finally {
			setSend({ kind: "idle" });
			refreshAccount();
		}
	};

	const handleSendToInbox = async () => {
		const controller = new AbortController();
		abortRef.current = controller;
		setSend({ kind: "sending", progress: null });
		try {
			const outcome = await sendVideoToTikTokInbox({
				video,
				signal: controller.signal,
				onProgress: (progress) => setSend({ kind: "sending", progress }),
			});
			setSend({ kind: "done", outcome });
		} catch (error) {
			if (controller.signal.aborted) return;
			const reconnect = error instanceof TikTokSendError && error.reconnect;
			setSend({
				kind: "error",
				message:
					error instanceof Error ? error.message : "Falha ao enviar ao TikTok.",
				reconnect,
			});
			if (reconnect) refreshAccount();
		} finally {
			if (abortRef.current === controller) abortRef.current = null;
		}
	};

	const showInbox = account?.configured === true;

	return (
		<div className="flex flex-col gap-3">
			<p className="text-sm font-medium">Enviar ao TikTok</p>

			{!isVertical && (
				<div className="flex gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-[11px] leading-relaxed">
					<AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-yellow-500" />
					<span>
						Este vídeo está em {describeAspectRatio(canvasSize)} (
						{canvasSize.width}×{canvasSize.height}). O TikTok é vertical (9:16):
						em outro formato ele aparece menor, com faixas pretas.
					</span>
				</div>
			)}

			{showInbox && (
				<InboxSection
					account={account}
					send={send}
					onDisconnect={handleDisconnect}
					onSend={handleSendToInbox}
				/>
			)}

			<div className="flex flex-col gap-1.5">
				{/* A real link, not window.open: a new tab from a click is never popup-blocked */}
				<Button
					asChild
					variant={showInbox && account?.connected ? "outline" : "default"}
					className="w-full gap-2"
				>
					<a
						href={TIKTOK_UPLOAD_PAGE_URL}
						target="_blank"
						rel="noopener noreferrer"
						onClick={() => setHasOpenedWebsite(true)}
					>
						<ExternalLink className="size-4" />
						Postar pelo site do TikTok
					</a>
				</Button>
				{hasOpenedWebsite ? (
					<p className="text-muted-foreground text-[11px] leading-relaxed">
						O arquivo <span className="text-foreground">{filename}</span> já está
						na pasta Downloads. Na aba do TikTok, clique em "Selecionar vídeo" e
						escolha esse arquivo.{" "}
						<button
							type="button"
							className="text-primary underline-offset-2 hover:underline"
							onClick={onDownloadAgain}
						>
							Baixar de novo
						</button>
					</p>
				) : (
					<p className="text-muted-foreground text-[11px] leading-relaxed">
						Abre tiktok.com/upload numa aba nova. Lá você escolhe o arquivo que
						acabou de baixar.
					</p>
				)}
			</div>
		</div>
	);
}

function InboxSection({
	account,
	send,
	onDisconnect,
	onSend,
}: {
	account: TikTokAccountResponse;
	send: SendState;
	onDisconnect: () => void;
	onSend: () => void;
}) {
	if (!account.connected) {
		// The login finishes in that tab, which tells this one over a BroadcastChannel
		return (
			<div className="flex flex-col gap-1.5">
				<Button asChild className="w-full gap-2">
					<a href={TIKTOK_LOGIN_PATH} target="_blank" rel="noopener">
						<Inbox className="size-4" />
						Conectar conta do TikTok
					</a>
				</Button>
				<p className="text-muted-foreground text-[11px] leading-relaxed">
					Uma vez conectada, o vídeo vai direto para a caixa de entrada do app do
					TikTok, sem baixar nada.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2 rounded-md border p-2">
			<div className="flex items-center justify-between gap-2">
				<p className="text-muted-foreground truncate text-[11px]">
					Conectado
					{account.displayName ? (
						<>
							{" "}como <span className="text-foreground">{account.displayName}</span>
						</>
					) : null}
				</p>
				<button
					type="button"
					className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[11px]"
					onClick={onDisconnect}
					disabled={send.kind === "sending"}
				>
					<LogOut className="size-3" />
					Desconectar
				</button>
			</div>

			{send.kind === "sending" ? (
				<SendingProgress progress={send.progress} />
			) : send.kind === "done" ? (
				<p className="text-[12px] leading-relaxed font-medium">
					{DONE_MESSAGES[send.outcome]}
				</p>
			) : (
				<>
					<Button className="w-full gap-2" onClick={onSend}>
						<Inbox className="size-4" />
						{send.kind === "error" ? "Tentar de novo" : "Enviar para o app do TikTok"}
					</Button>
					{send.kind === "error" ? (
						<p className="text-destructive text-[11px] leading-relaxed">
							{send.message}
						</p>
					) : (
						<p className="text-muted-foreground text-[11px] leading-relaxed">
							O vídeo chega como rascunho na caixa de entrada do app. O TikTok
							aceita até 5 envios pendentes por dia.
						</p>
					)}
				</>
			)}
		</div>
	);
}

function SendingProgress({
	progress,
}: {
	progress: TikTokSendProgress | null;
}) {
	if (progress?.phase === "processing") {
		return (
			<p className="text-muted-foreground text-[11px]">
				Enviado. Esperando o TikTok processar o vídeo…
			</p>
		);
	}
	const percent = progress
		? Math.round((progress.uploadedBytes / progress.videoSize) * 100)
		: 0;
	const toMegabytes = (bytes: number) => (bytes / 1_000_000).toFixed(1);
	return (
		<div className="flex flex-col gap-1.5">
			<Progress value={percent} className="w-full" />
			<p className="text-muted-foreground text-[11px]">
				{progress
					? `Enviando ao TikTok: ${toMegabytes(progress.uploadedBytes)} de ${toMegabytes(progress.videoSize)} MB`
					: "Preparando o envio…"}
			</p>
		</div>
	);
}
