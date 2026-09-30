"use client";

import { useCallback, useState } from "react";
import { cn } from "@/utils/ui";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { HugeiconsIcon } from "@hugeicons/react";
import { CursorMove01Icon } from "@hugeicons/core-free-icons";
import { useMotionTracking } from "@/hooks/use-motion-tracking";
import type { TrackingRegion } from "@/lib/motion-tracking/tracking-types";

export function MotionTrackingPanel({ className }: { className?: string }) {
	const { status, progress, track, error, startTracking, applyTrack, reset } =
		useMotionTracking();
	const [regionX, setRegionX] = useState(25);
	const [regionY, setRegionY] = useState(25);
	const [regionSize, setRegionSize] = useState(15);
	const [sampleInterval, setSampleInterval] = useState(0.1);
	const [searchRadius, setSearchRadius] = useState(64);

	const handleStart = useCallback(async () => {
		const editorTracks = [] as Array<{ id: string; elements: Array<{ id: string; type: string; mediaId?: string }> }>;
		let videoElementId: string | null = null;
		let videoTrackId: string | null = null;

		for (const t of editorTracks) {
			for (const el of t.elements) {
				if (el.type === "video" && el.mediaId) {
					videoElementId = el.id;
					videoTrackId = t.id;
					break;
				}
			}
			if (videoElementId) break;
		}

		if (!videoElementId || !videoTrackId) return;

		const region: TrackingRegion = {
			x: regionX,
			y: regionY,
			width: regionSize,
			height: regionSize,
		};

		await startTracking(videoElementId, videoTrackId, region, {
			sampleInterval,
			searchRadius,
		});
	}, [startTracking, regionX, regionY, regionSize, sampleInterval, searchRadius]);

	const isBusy = status === "extracting" || status === "tracking" || status === "applying";

	return (
		<div className={cn("flex flex-col h-full", className)}>
			<div className="px-4 py-3 border-b space-y-2">
				<div className="flex items-center gap-2">
					<HugeiconsIcon icon={CursorMove01Icon} className="size-4 text-primary" />
					<span className="text-xs font-medium">Rastreamento de Movimento</span>
				</div>
				<p className="text-[10px] text-muted-foreground">
					Rastreia um objeto ao longo dos quadros usando correspondência de
					padrões. Gera keyframes de posição que podem ser aplicados a qualquer elemento.
				</p>
			</div>

			<div className="px-4 py-3 space-y-4 flex-1 overflow-y-auto">
				<div className="space-y-1.5">
					<span className="text-[10px] font-medium text-muted-foreground">
						Região de Rastreamento (% do quadro)
					</span>
					<div className="grid grid-cols-3 gap-2">
						<div className="space-y-1">
							<span className="text-[8px] text-muted-foreground">X %</span>
							<Slider
								value={[regionX]}
								onValueChange={([v]) => setRegionX(v)}
								min={0}
								max={90}
								step={1}
							/>
						</div>
						<div className="space-y-1">
							<span className="text-[8px] text-muted-foreground">Y %</span>
							<Slider
								value={[regionY]}
								onValueChange={([v]) => setRegionY(v)}
								min={0}
								max={90}
								step={1}
							/>
						</div>
						<div className="space-y-1">
							<span className="text-[8px] text-muted-foreground">Tamanho %</span>
							<Slider
								value={[regionSize]}
								onValueChange={([v]) => setRegionSize(v)}
								min={5}
								max={50}
								step={1}
							/>
						</div>
					</div>
				</div>

				<div className="space-y-1.5">
					<div className="flex justify-between text-[10px] text-muted-foreground">
						<span>Intervalo de Amostragem</span>
						<span className="font-mono">{sampleInterval.toFixed(1)}s</span>
					</div>
					<Slider
						value={[sampleInterval]}
						onValueChange={([v]) => setSampleInterval(v)}
						min={0.05}
						max={1}
						step={0.05}
					/>
					<span className="text-[8px] text-muted-foreground">
						Menor = mais preciso, porém mais lento
					</span>
				</div>

				<div className="space-y-1.5">
					<div className="flex justify-between text-[10px] text-muted-foreground">
						<span>Raio de Busca</span>
						<span className="font-mono">{searchRadius}px</span>
					</div>
					<Slider
						value={[searchRadius]}
						onValueChange={([v]) => setSearchRadius(v)}
						min={16}
						max={128}
						step={8}
					/>
				</div>

				{status === "idle" && (
					<Button className="w-full" onClick={handleStart}>
						Iniciar Rastreamento
					</Button>
				)}

				{isBusy && (
					<div className="space-y-2">
						<div className="h-1.5 rounded-full bg-secondary overflow-hidden">
							<div
								className="h-full bg-primary rounded-full transition-all duration-300"
								style={{ width: `${progress}%` }}
							/>
						</div>
						<p className="text-[10px] text-muted-foreground text-center">
							{status === "extracting"
								? "Extraindo modelo..."
								: status === "tracking"
									? `Rastreando quadro ${Math.round(progress)}%...`
									: "Aplicando keyframes..."}
						</p>
						<Button variant="outline" size="sm" className="w-full h-5 text-[8px]" onClick={reset}>
							Cancelar
						</Button>
					</div>
				)}

				{status === "done" && track && (
					<>
						<div className="rounded border p-2 space-y-1">
							<div className="flex items-center justify-between">
								<span className="text-[9px] font-medium">Resultado do Rastreamento</span>
								<span className="text-[8px] text-muted-foreground">
									{track.frames.length} quadros
								</span>
							</div>
							<div className="grid grid-cols-2 gap-1 text-center">
								<div>
									<p className="text-[10px] font-mono font-medium">
										{track.startTime.toFixed(1)}s - {track.endTime.toFixed(1)}s
									</p>
									<p className="text-[7px] text-muted-foreground">Duração</p>
								</div>
								<div>
									<p className="text-[10px] font-mono font-medium">
										{track.frames.filter((f) => f.confidence > 0.5).length}
									</p>
									<p className="text-[7px] text-muted-foreground">Alta Confiança</p>
								</div>
							</div>
						</div>

						<div className="flex gap-2">
							<Button className="flex-1" onClick={applyTrack}>
								Aplicar Keyframes
							</Button>
							<Button variant="outline" onClick={reset}>
								Redefinir
							</Button>
						</div>
					</>
				)}

				{status === "error" && (
					<div className="rounded border border-red-500/20 bg-red-500/5 p-2">
						<p className="text-[10px] text-red-500">{error}</p>
						<Button
							variant="outline"
							size="sm"
							className="mt-1.5 h-5 text-[8px]"
							onClick={reset}
						>
							Tentar Novamente
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
