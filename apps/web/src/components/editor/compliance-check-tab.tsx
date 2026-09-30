"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { aiClient } from "@/lib/ai-client";
import type {
	ComplianceCategoryId,
	ComplianceItem,
	ComplianceStatus,
	TikTokComplianceReport,
	TikTokComplianceResult,
} from "@/lib/ai-client";
import { useEditor } from "@/hooks/use-editor";
import { TranscribeNotice } from "@/components/editor/transcribe-notice";
import { captureComplianceFrames } from "@/services/compliance/capture-frames";
import { useAIStore } from "@/stores/ai-store";
import { useTranscriptStore } from "@/stores/transcript-store";
import { cn } from "@/utils/ui";

const AD_INFO_MAX_LENGTH = 2000;

const CATEGORIES: { id: ComplianceCategoryId; label: string }[] = [
	{ id: "claims", label: "Alegações" },
	{ id: "minors", label: "Menores" },
	{ id: "watermark", label: "Marca d'água" },
	{ id: "product_ad", label: "Produto x anúncio" },
];

const STATUS_STYLES: Record<
	ComplianceStatus,
	{ label: string; badge: string }
> = {
	ok: {
		label: "Ok",
		badge: "border-green-500/30 bg-green-500/10 text-green-400",
	},
	atencao: {
		label: "Atenção",
		badge: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
	},
	risco: {
		label: "Risco",
		badge: "border-red-500/30 bg-red-500/10 text-red-400",
	},
};

function formatClock(seconds: number): string {
	const whole = Math.floor(seconds);
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function getEmptyMessage(
	id: ComplianceCategoryId,
	report: TikTokComplianceReport,
): string {
	const frames = report.frames_analyzed;
	switch (id) {
		case "claims":
			return report.transcript_used
				? `Nenhuma alegação problemática na fala nem no texto dos ${frames} quadros.`
				: `Nenhuma alegação problemática no texto dos ${frames} quadros (sem transcrição, a fala não foi conferida).`;
		case "minors":
			return `Nenhuma criança ou menor identificado nos ${frames} quadros.`;
		case "watermark":
			return `Nenhuma marca d'água ou logotipo de outra plataforma nos ${frames} quadros.`;
		case "product_ad":
			return report.ad_info_used
				? "Nada divergente entre o vídeo e os dados do anúncio."
				: "Nada suspeito no vídeo. Sem os dados do anúncio, preço, quantidade e cores não foram conferidos.";
	}
}

function ItemRow({ item }: { item: ComplianceItem }) {
	const isRisk = item.level === "risco";
	return (
		<li className="flex items-start gap-2 text-xs">
			<span
				className={cn(
					"mt-1 size-2 shrink-0 rounded-full",
					isRisk ? "bg-red-400" : "bg-yellow-400",
				)}
			/>
			<div className="min-w-0 space-y-0.5 break-words">
				<p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
					<span
						className={cn(
							"font-medium",
							isRisk ? "text-red-400" : "text-yellow-400",
						)}
					>
						{isRisk ? "Risco" : "Atenção"}
					</span>
					{item.time !== null && (
						<span className="font-mono text-muted-foreground">
							{formatClock(item.time)}
						</span>
					)}
					{item.source === "varredura" && (
						<Badge
							variant="outline"
							className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
						>
							varredura
						</Badge>
					)}
				</p>
				<p>{item.text}</p>
				{item.evidence && (
					<p className="italic text-muted-foreground">{item.evidence}</p>
				)}
				{item.suggestion && (
					<p className="text-muted-foreground">Sugestão: {item.suggestion}</p>
				)}
			</div>
		</li>
	);
}

interface ComplianceCheckTabProps {
	hasVideo: boolean;
	onClose: () => void;
}

export function ComplianceCheckTab({
	hasVideo,
	onClose,
}: ComplianceCheckTabProps) {
	const editor = useEditor();
	const segments = useTranscriptStore((s) => s.segments);
	const backendStatus = useAIStore((s) => s.backendStatus);
	const toggleSetupGuide = useAIStore((s) => s.toggleSetupGuide);

	const [adInfo, setAdInfo] = useState("");
	const [phase, setPhase] = useState<"idle" | "capturing" | "analyzing">(
		"idle",
	);
	const [progress, setProgress] = useState({ current: 0, total: 0 });
	const [result, setResult] = useState<TikTokComplianceResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Bumped on every run and on unmount so a stale run can't touch the state
	const runIdRef = useRef(0);
	useEffect(
		() => () => {
			runIdRef.current += 1;
		},
		[],
	);

	const llm = backendStatus?.llm;
	const isRunning = phase !== "idle";

	const handleRun = useCallback(async () => {
		const runId = ++runIdRef.current;
		const isCurrent = () => runIdRef.current === runId;

		setError(null);
		setResult(null);
		setProgress({ current: 0, total: 0 });
		setPhase("capturing");

		try {
			const frames = await captureComplianceFrames(editor, (current, total) => {
				if (isCurrent()) setProgress({ current, total });
			});
			if (!isCurrent()) return;

			setPhase("analyzing");
			const response = await aiClient.checkTikTokCompliance({
				frames: frames.map((f) => ({ time: f.time, image: f.dataUrl })),
				transcript: segments.map((s) => ({
					start: s.start,
					end: s.end,
					text: s.text,
				})),
				ad_info: adInfo.trim() || undefined,
			});
			if (isCurrent()) setResult(response);
		} catch (e) {
			if (isCurrent()) {
				setError(
					e instanceof Error ? e.message : "Falha ao checar a conformidade",
				);
			}
		} finally {
			if (isCurrent()) setPhase("idle");
		}
	}, [editor, segments, adInfo]);

	const handleOpenAISettings = useCallback(() => {
		toggleSetupGuide();
		onClose();
	}, [toggleSetupGuide, onClose]);

	if (!hasVideo) {
		return (
			<div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 text-center space-y-2">
				<p className="text-sm font-medium text-yellow-400">
					Nenhum vídeo na timeline
				</p>
				<p className="text-xs text-muted-foreground">
					Adicione um vídeo na timeline primeiro e depois confira a conformidade
					com o TikTok Shop antes de publicar.
				</p>
				<Button variant="outline" size="sm" onClick={onClose}>
					Entendi
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{isRunning && (
				<div className="flex flex-col items-center gap-3 py-6">
					<Spinner className="h-6 w-6" />
					<p className="text-sm text-muted-foreground">
						{phase === "capturing"
							? `Capturando quadro ${progress.current}/${progress.total}`
							: `Analisando quadros e transcrição${llm?.model ? ` com ${llm.model}` : ""}... pode levar alguns minutos.`}
					</p>
				</div>
			)}

			{!isRunning && !result && (
				<div className="space-y-3">
					<p className="text-sm text-muted-foreground text-center">
						Captura quadros do vídeo e, junto com a transcrição, pergunta ao
						modelo de IA ativo se ele viola as regras do TikTok Shop.
					</p>
					<TranscribeNotice description="Sem transcrição, a checagem das falas perde força; a das imagens continua." />
					<div className="rounded-lg border bg-muted/20 p-3 space-y-2">
						<div className="flex items-start justify-between gap-2">
							<div className="space-y-0.5">
								<label
									htmlFor="compliance-ad-info"
									className="text-sm font-medium text-foreground"
								>
									Dados do anúncio
								</label>
								<p className="text-[11px] text-muted-foreground">
									Recomendado: com eles a IA confere se preço, kit e cores do
									vídeo batem com o anúncio.
								</p>
							</div>
							<span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">
								opcional
							</span>
						</div>
						<Textarea
							id="compliance-ad-info"
							value={adInfo}
							onChange={(e) => setAdInfo(e.target.value)}
							maxLength={AD_INFO_MAX_LENGTH}
							rows={3}
							placeholder="Título, preço padrão, kit e cores. Ex.: Cinta modeladora — R$ 39,90 (1 unidade) — kit com 3 por R$ 99 — preto e bege"
							className="border-border bg-background text-xs md:text-xs placeholder:text-muted-foreground/45"
						/>
						<p className="text-[11px] text-muted-foreground">
							{adInfo.trim()
								? `${adInfo.length}/${AD_INFO_MAX_LENGTH} caracteres`
								: "Sem esses dados, preço, quantidade e cores só viram pontos de atenção a conferir."}
						</p>
					</div>
					{llm?.cloud && (
						<p className="text-[11px] text-muted-foreground">
							Os quadros e a transcrição serão enviados ao modelo em nuvem (
							{llm.model}).
						</p>
					)}
					<Button className="w-full" onClick={handleRun}>
						Checar conformidade
					</Button>
				</div>
			)}

			{error && !isRunning && (
				<div className="space-y-3">
					<div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
						<p className="text-sm text-red-400 break-words">{error}</p>
					</div>
					<Button variant="outline" className="w-full" onClick={handleRun}>
						Tentar de novo
					</Button>
				</div>
			)}

			{result?.refused && !isRunning && (
				<div className="space-y-3">
					<div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-2">
						<p className="text-sm font-medium text-yellow-400">
							Checagem não realizada
						</p>
						<p className="text-xs text-muted-foreground break-words">
							{result.reason}
						</p>
						<p className="text-xs text-muted-foreground">
							Esta checagem só roda em um modelo que aceite imagens. Troque o
							modelo em Configurações de IA: na seção Nuvem, escolha um modelo
							multimodal, ou use um modelo local com visão no Ollama.
						</p>
					</div>
					<div className="flex gap-2">
						<Button className="flex-1" onClick={handleOpenAISettings}>
							Abrir configurações de IA
						</Button>
						<Button variant="outline" className="flex-1" onClick={handleRun}>
							Tentar de novo
						</Button>
					</div>
				</div>
			)}

			{result && !result.refused && !isRunning && (
				<div className="space-y-4">
					<div className="rounded-lg border p-3 space-y-1">
						{result.summary && <p className="text-sm">{result.summary}</p>}
						<p className="text-[11px] text-muted-foreground">
							Modelo: {result.llm.model}
							{result.llm.cloud ? " (nuvem)" : ""} · {result.frames_analyzed}{" "}
							quadros · transcrição{" "}
							{result.transcript_used ? "usada" : "não usada"}
							{result.ad_info_used ? " · dados do anúncio usados" : ""}
						</p>
					</div>

					{CATEGORIES.map(({ id, label }) => {
						const category = result.categories[id];
						const style = STATUS_STYLES[category.status];
						return (
							<div key={id} className="rounded-lg border p-3 space-y-2">
								<div className="flex items-center justify-between">
									<h4 className="text-sm font-semibold">{label}</h4>
									<Badge className={cn("shadow-none", style.badge)}>
										{style.label}
									</Badge>
								</div>
								{category.items.length === 0 ? (
									<p className="text-xs text-muted-foreground">
										{getEmptyMessage(id, result)}
									</p>
								) : (
									<ul className="space-y-2.5">
										{category.items.map((item) => (
											<ItemRow
												key={`${item.source}:${item.time ?? "-"}:${item.text}`}
												item={item}
											/>
										))}
									</ul>
								)}
							</div>
						);
					})}

					<div className="flex gap-2">
						<Button
							variant="outline"
							className="flex-1"
							onClick={() => setResult(null)}
						>
							Ajustar e checar de novo
						</Button>
						<Button variant="outline" className="flex-1" onClick={onClose}>
							Fechar
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
