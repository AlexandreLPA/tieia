"use client";

import { useState, useCallback } from "react";
import { cn } from "@/utils/ui";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { HugeiconsIcon } from "@hugeicons/react";
import { Film02Icon } from "@hugeicons/core-free-icons";
import { useSceneDetection } from "@/hooks/use-scene-detection";
import {
	DEFAULT_SCENE_OPTIONS,
	type SceneDetectionOptions,
} from "@/lib/scene-detection/scene-detection-types";

function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SceneDetectionPanel({ className }: { className?: string }) {
	const { detect, scenes, isDetecting, splitAtScenes } = useSceneDetection();
	const [threshold, setThreshold] = useState(DEFAULT_SCENE_OPTIONS.threshold);
	const [sampleInterval, setSampleInterval] = useState(
		DEFAULT_SCENE_OPTIONS.sampleInterval,
	);

	const handleDetect = useCallback(async () => {
		await detect({ threshold, sampleInterval });
	}, [detect, threshold, sampleInterval]);

	return (
		<div className={cn("flex flex-col h-full", className)}>
			<div className="px-4 py-3 border-b space-y-2">
				<div className="flex items-center gap-2">
					<HugeiconsIcon icon={Film02Icon} className="size-4 text-primary" />
					<span className="text-xs font-medium">Detecção de Cenas</span>
				</div>
				<p className="text-[10px] text-muted-foreground">
					Detecta mudanças visuais de cena analisando os quadros localmente.
					Nenhum dado sai da sua máquina.
				</p>
			</div>

			<div className="px-4 py-3 space-y-4 flex-1 overflow-y-auto">
				<div className="space-y-1.5">
					<div className="flex justify-between text-[10px] text-muted-foreground">
						<span>Limite de Sensibilidade</span>
						<span className="font-mono">{threshold.toFixed(2)}</span>
					</div>
					<Slider
						value={[threshold]}
						onValueChange={([v]) => setThreshold(v)}
						min={0.1}
						max={1.0}
						step={0.05}
					/>
					<span className="text-[8px] text-muted-foreground">
						Menor = mais detecções
					</span>
				</div>

				<div className="space-y-1.5">
					<div className="flex justify-between text-[10px] text-muted-foreground">
						<span>Intervalo de Amostragem</span>
						<span className="font-mono">{sampleInterval}s</span>
					</div>
					<Slider
						value={[sampleInterval]}
						onValueChange={([v]) => setSampleInterval(v)}
						min={0.25}
						max={2.0}
						step={0.25}
					/>
				</div>

				<Button
					className="w-full"
					onClick={handleDetect}
					disabled={isDetecting}
				>
					{isDetecting ? "Detectando..." : "Detectar Mudanças de Cena"}
				</Button>

				{scenes.length > 0 && (
					<>
						<div className="flex items-center justify-between">
							<span className="text-[10px] font-medium text-muted-foreground">
								{scenes.length} mudança{scenes.length !== 1 ? "s" : ""} de cena encontrada{scenes.length !== 1 ? "s" : ""}
							</span>
							<Button
								variant="secondary"
								size="sm"
								className="h-5 text-[8px]"
								onClick={splitAtScenes}
							>
								Dividir nas Cenas
							</Button>
						</div>

						<div className="space-y-1">
							{scenes.map((scene) => (
								<div
									key={`scene-${scene.index}`}
									className="rounded border p-1.5 flex items-center gap-2"
								>
									{scene.frameBefore && (
										<img
											src={scene.frameBefore}
											alt="Antes"
											className="w-12 h-auto rounded"
										/>
									)}
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-1">
											<span className="text-[9px] font-mono font-medium">
												{formatTime(scene.time)}
											</span>
											<span
												className={cn(
													"text-[7px] px-1 rounded",
													scene.type === "cut"
														? "bg-red-500/10 text-red-500"
														: "bg-yellow-500/10 text-yellow-600",
												)}
											>
												{scene.type}
											</span>
										</div>
										<span className="text-[8px] text-muted-foreground">
											Confiança: {Math.round(scene.confidence * 100)}%
										</span>
									</div>
									{scene.frameAfter && (
										<img
											src={scene.frameAfter}
											alt="Depois"
											className="w-12 h-auto rounded"
										/>
									)}
								</div>
							))}
						</div>
					</>
				)}

				{scenes.length === 0 && !isDetecting && (
					<p className="text-[10px] text-muted-foreground text-center py-4">
						Execute a detecção para encontrar mudanças de cena no seu vídeo.
					</p>
				)}
			</div>
		</div>
	);
}
