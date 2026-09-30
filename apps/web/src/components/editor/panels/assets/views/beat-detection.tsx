"use client";

import { useState, useCallback } from "react";
import { cn } from "@/utils/ui";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { MusicNote01Icon } from "@hugeicons/core-free-icons";
import { useBeatDetection } from "@/hooks/use-beat-detection";

export function BeatDetectionPanel({ className }: { className?: string }) {
	const { detect, result, gridConfig, setGridConfig } = useBeatDetection();
	const [isDetecting, setIsDetecting] = useState(false);

	const handleDetect = useCallback(async () => {
		setIsDetecting(true);
		try {
			await detect();
		} finally {
			setIsDetecting(false);
		}
	}, [detect]);

	return (
		<div className={cn("flex flex-col h-full", className)}>
			<div className="px-4 py-3 border-b space-y-2">
				<div className="flex items-center gap-2">
					<HugeiconsIcon icon={MusicNote01Icon} className="size-4 text-primary" />
					<span className="text-xs font-medium">Detecção de Batidas</span>
				</div>
				<p className="text-[10px] text-muted-foreground">
					Detecte batidas no seu áudio para uma edição com consciência de ritmo.
				</p>
			</div>

			<div className="px-4 py-3 space-y-4 flex-1 overflow-y-auto">
				<Button
					className="w-full"
					onClick={handleDetect}
					disabled={isDetecting}
				>
					{isDetecting ? "Detectando..." : "Detectar batidas"}
				</Button>

				{result && (
					<>
						<div className="rounded border p-2 space-y-1.5">
							<span className="text-[10px] font-medium">Resultados</span>
							<div className="grid grid-cols-2 gap-1 text-[9px]">
								<div>
									<span className="text-muted-foreground">BPM: </span>
									<span className="font-mono font-medium">{result.bpm}</span>
								</div>
								<div>
									<span className="text-muted-foreground">Batidas: </span>
									<span className="font-mono">{result.beats.length}</span>
								</div>
								<div>
									<span className="text-muted-foreground">Confiança: </span>
									<span className="font-mono">
										{Math.round(result.confidence * 100)}%
									</span>
								</div>
							</div>
						</div>

						<div className="space-y-1.5">
							<span className="text-[10px] text-muted-foreground">Grade de Batidas</span>
							<Button
								variant={gridConfig.showGrid ? "secondary" : "ghost"}
								size="sm"
								className="h-6 text-[9px]"
								onClick={() =>
									setGridConfig((g) => ({ ...g, showGrid: !g.showGrid }))
								}
							>
								Mostrar grade de batidas {gridConfig.showGrid ? "Ativado" : "Desativado"}
							</Button>
						</div>

						<div className="space-y-1.5">
							<span className="text-[10px] text-muted-foreground">Ajuste</span>
							<Button
								variant={gridConfig.snapToBeats ? "secondary" : "ghost"}
								size="sm"
								className="h-6 text-[9px]"
								onClick={() =>
									setGridConfig((g) => ({ ...g, snapToBeats: !g.snapToBeats }))
								}
							>
								Ajustar às batidas {gridConfig.snapToBeats ? "Ativado" : "Desativado"}
							</Button>
						</div>

						<div className="rounded bg-accent/30 p-2">
							<div className="h-8 flex items-end gap-px">
								{result.beats.slice(0, 100).map((beat, i) => (
									<div
										key={i}
										className={cn(
											"flex-1 rounded-t min-w-[2px]",
											beat.strength > 0.8
												? "bg-primary h-full"
												: beat.strength > 0.4
													? "bg-primary/60"
													: "bg-primary/30",
										)}
										style={{
											height: `${Math.max(beat.strength * 100, 15)}%`,
										}}
									/>
								))}
							</div>
							<span className="text-[7px] text-muted-foreground block text-center mt-1">
								Visualização da intensidade das batidas
							</span>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
