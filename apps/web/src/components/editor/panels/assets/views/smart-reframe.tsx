"use client";

import { useCallback, useState } from "react";
import { cn } from "@/utils/ui";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { HugeiconsIcon } from "@hugeicons/react";
import { CropIcon } from "@hugeicons/core-free-icons";
import { useEditor } from "@/hooks/use-editor";
import { useSmartReframe } from "@/hooks/use-smart-reframe";
import {
	REFRAME_PRESETS,
	type ReframePreset,
} from "@/lib/reframe/reframe-types";

export function SmartReframePanel({ className }: { className?: string }) {
	const editor = useEditor();
	const { status, progress, result, error, startReframe, applyKeyframes, reset } =
		useSmartReframe();
	const [selectedPreset, setSelectedPreset] = useState<ReframePreset>(REFRAME_PRESETS[0]);
	const [padding, setPadding] = useState(0.15);
	const [smoothing, setSmoothing] = useState(0.5);

	const handleStart = useCallback(async () => {
		const tracks = editor.timeline.getTracks();

		let videoElementId: string | null = null;
		let videoTrackId: string | null = null;

		for (const track of tracks) {
			for (const element of track.elements) {
				if (element.type === "video" && "mediaId" in element && element.mediaId) {
					videoElementId = element.id;
					videoTrackId = track.id;
					break;
				}
			}
			if (videoElementId) break;
		}

		if (!videoElementId || !videoTrackId) return;

		await startReframe(videoElementId, videoTrackId, selectedPreset, {
			padding,
			smoothingWindow: smoothing,
			targetWidth: selectedPreset.width,
			targetHeight: selectedPreset.height,
		});
	}, [editor, startReframe, selectedPreset, padding, smoothing]);

	return (
		<div className={cn("flex flex-col h-full", className)}>
			<div className="px-4 py-3 border-b space-y-2">
				<div className="flex items-center gap-2">
					<HugeiconsIcon icon={CropIcon} className="size-4 text-primary" />
					<span className="text-xs font-medium">Reenquadramento inteligente</span>
				</div>
				<p className="text-[10px] text-muted-foreground">
					Detecta rostos automaticamente e gera keyframes para manter os sujeitos
					centralizados ao reenquadrar para diferentes proporções (ex.: paisagem para vertical).
				</p>
			</div>

			<div className="px-4 py-3 space-y-4 flex-1 overflow-y-auto">
				<div className="space-y-1.5">
					<span className="text-[10px] font-medium text-muted-foreground">
						Formato de destino
					</span>
					<div className="grid grid-cols-2 gap-1.5">
						{REFRAME_PRESETS.map((preset) => (
							<button
								key={preset.id}
								className={cn(
									"rounded border px-2 py-1.5 text-[9px] text-left transition-colors",
									selectedPreset.id === preset.id
										? "border-primary bg-primary/5 text-primary"
										: "border-border hover:border-primary/30",
								)}
								onClick={() => setSelectedPreset(preset)}
							>
								<span className="font-medium">{preset.label}</span>
								<span className="block text-[8px] text-muted-foreground">
									{preset.name}
								</span>
							</button>
						))}
					</div>
				</div>

				<div className="space-y-1.5">
					<div className="flex justify-between text-[10px] text-muted-foreground">
						<span>Suavização</span>
						<span className="font-mono">{smoothing.toFixed(1)}s</span>
					</div>
					<Slider
						value={[smoothing]}
						onValueChange={([v]) => setSmoothing(v)}
						min={0}
						max={2}
						step={0.1}
					/>
					<span className="text-[8px] text-muted-foreground">
						Quanto maior, mais suave o movimento de câmera
					</span>
				</div>

				<div className="space-y-1.5">
					<div className="flex justify-between text-[10px] text-muted-foreground">
						<span>Margem do rosto</span>
						<span className="font-mono">{Math.round(padding * 100)}%</span>
					</div>
					<Slider
						value={[padding]}
						onValueChange={([v]) => setPadding(v)}
						min={0}
						max={0.4}
						step={0.05}
					/>
				</div>

				{status === "idle" && (
					<Button className="w-full" onClick={handleStart}>
						Analisar e reenquadrar
					</Button>
				)}

				{(status === "detecting" || status === "computing") && (
					<div className="space-y-2">
						<div className="h-1.5 rounded-full bg-secondary overflow-hidden">
							<div
								className="h-full bg-primary rounded-full transition-all duration-300"
								style={{ width: `${progress}%` }}
							/>
						</div>
						<p className="text-[10px] text-muted-foreground text-center">
							{status === "detecting"
								? "Detectando rostos no vídeo..."
								: "Calculando keyframes de reenquadramento..."}
						</p>
					</div>
				)}

				{status === "applying" && (
					<p className="text-[10px] text-muted-foreground text-center">
						Aplicando keyframes à linha do tempo...
					</p>
				)}

				{status === "done" && result && (
					<>
						<div className="rounded border p-2 space-y-1">
							<div className="flex items-center justify-between">
								<span className="text-[9px] font-medium">Resultado</span>
								<span className="text-[8px] text-muted-foreground">
									{result.preset.label}
								</span>
							</div>
							<div className="grid grid-cols-3 gap-1 text-center">
								<div>
									<p className="text-[10px] font-mono font-medium">
										{result.framesAnalyzed}
									</p>
									<p className="text-[7px] text-muted-foreground">Quadros</p>
								</div>
								<div>
									<p className="text-[10px] font-mono font-medium">
										{result.keyframes.positionX.length}
									</p>
									<p className="text-[7px] text-muted-foreground">Chaves X</p>
								</div>
								<div>
									<p className="text-[10px] font-mono font-medium">
										{result.detectionResult.total_faces_detected}
									</p>
									<p className="text-[7px] text-muted-foreground">Rostos</p>
								</div>
							</div>
						</div>

						<div className="flex gap-2">
							<Button className="flex-1" onClick={applyKeyframes}>
								Aplicar à linha do tempo
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
							Tentar novamente
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
