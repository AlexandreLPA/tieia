"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon, TransitionRightIcon } from "@hugeicons/core-free-icons";
import { useEditor } from "@/hooks/use-editor";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
	getAllTransitions,
	getMaxTransitionDuration,
	getTransitionJunctions,
	hasTransition,
	type TransitionJunction,
} from "@/lib/transitions";
import {
	AddTransitionCommand,
	RemoveTransitionCommand,
} from "@/lib/commands/timeline/element/transitions/add-transition";
import { BatchCommand } from "@/lib/commands/batch-command";
import { timelineTimeToPixels } from "@/lib/timeline";
import type { TimelineTrack } from "@/types/timeline";
import { cn } from "@/utils/ui";
import { TransitionPicker } from "@/components/editor/transition-preview";

// Stops the track underneath from seeking or clearing the selection
const stop = (event: React.SyntheticEvent) => event.stopPropagation();

function formatSeconds(seconds: number): string {
	return `${seconds.toFixed(1).replace(".", ",")} s`;
}

function clampDuration(duration: number, junction: TransitionJunction) {
	return Math.min(duration, getMaxTransitionDuration({ junction }));
}

/**
 * CapCut-style "+" on every cut between two touching clips. Opens a picker
 * to add, change, time or remove the transition at that cut.
 */
export function TransitionJunctions({
	track,
	zoomLevel,
	isDragging,
}: {
	track: TimelineTrack;
	zoomLevel: number;
	isDragging: boolean;
}) {
	if (isDragging) return null;
	const junctions = getTransitionJunctions({ track });

	return junctions.map((junction) => (
		<JunctionButton
			key={`${junction.from.id}-${junction.to.id}`}
			track={track}
			junction={junction}
			junctions={junctions}
			zoomLevel={zoomLevel}
		/>
	));
}

function JunctionButton({
	track,
	junction,
	junctions,
	zoomLevel,
}: {
	track: TimelineTrack;
	junction: TransitionJunction;
	junctions: TransitionJunction[];
	zoomLevel: number;
}) {
	const editor = useEditor();
	const [open, setOpen] = useState(false);
	const current =
		junction.from.transitionOut &&
		hasTransition({ transitionType: junction.from.transitionOut.type })
			? junction.from.transitionOut
			: undefined;
	const maxDuration = getMaxTransitionDuration({ junction });
	const [draftDuration, setDraftDuration] = useState<number | null>(null);
	const duration = draftDuration ?? current?.duration ?? 0;

	const left = timelineTimeToPixels({ time: junction.cutTime, zoomLevel });
	const width = current
		? Math.max(16, timelineTimeToPixels({ time: current.duration, zoomLevel }))
		: 18;
	const transitions = getAllTransitions();
	const currentName = current
		? transitions.find((t) => t.type === current.type)?.name
		: undefined;

	const apply = (transitionType: string, nextDuration?: number) => {
		const definition = transitions.find((t) => t.type === transitionType);
		editor.command.execute({
			command: new AddTransitionCommand({
				trackId: track.id,
				elementId: junction.from.id,
				transitionType,
				duration: clampDuration(
					nextDuration ??
						current?.duration ??
						definition?.defaultDuration ??
						0.5,
					junction,
				),
			}),
		});
	};

	const applyToAll = () => {
		if (!current) return;
		editor.command.execute({
			command: new BatchCommand(
				junctions.map(
					(other) =>
						new AddTransitionCommand({
							trackId: track.id,
							elementId: other.from.id,
							transitionType: current.type,
							duration: clampDuration(current.duration, other),
						}),
				),
			),
		});
		setOpen(false);
	};

	const remove = () => {
		editor.command.execute({
			command: new RemoveTransitionCommand({
				trackId: track.id,
				elementId: junction.from.id,
			}),
		});
		setOpen(false);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				setDraftDuration(null);
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={
						current
							? `Transição: ${currentName}. Clique para editar`
							: "Adicionar transição neste corte"
					}
					title={
						current
							? `${currentName} · ${formatSeconds(current.duration)}`
							: "Adicionar transição"
					}
					onMouseDown={stop}
					onClick={stop}
					className={cn(
						"absolute top-1/2 z-20 flex h-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm",
						"focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none",
						current
							? "bg-primary text-primary-foreground border-primary/60 rounded-md"
							: cn(
									"bg-background text-foreground border-border hover:bg-primary hover:text-primary-foreground",
									"opacity-0 transition-opacity group-hover/track:opacity-90 hover:opacity-100 focus-visible:opacity-100",
									open && "opacity-100",
								),
					)}
					style={{ left, width }}
				>
					<HugeiconsIcon
						icon={current ? TransitionRightIcon : PlusSignIcon}
						className="size-3 shrink-0"
					/>
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="w-[22rem] p-3"
				side="top"
				onMouseDown={stop}
				onClick={stop}
				onKeyDown={stop}
			>
				<div className="mb-2 flex items-center justify-between">
					<span className="text-sm font-medium">Transição</span>
					{current && (
						<span className="text-muted-foreground text-xs">{currentName}</span>
					)}
				</div>
				<TransitionPicker
					transitions={transitions}
					selectedType={current?.type}
					onPick={(transition) => apply(transition.type)}
					gridClassName="max-h-64"
				/>

				{current ? (
					<div className="mt-3 space-y-3 border-t pt-3">
						<div className="space-y-2">
							<div className="flex items-center justify-between text-xs">
								<span>Duração</span>
								<span className="text-muted-foreground tabular-nums">
									{formatSeconds(duration)}
								</span>
							</div>
							<Slider
								min={0.1}
								max={maxDuration}
								step={0.1}
								value={[Math.min(duration, maxDuration)]}
								onValueChange={([value]) => setDraftDuration(value)}
								onValueCommit={([value]) => {
									apply(current.type, value);
									setDraftDuration(null);
								}}
								aria-label="Duração da transição"
							/>
						</div>
						<div className="flex gap-2">
							{junctions.length > 1 && (
								<Button
									size="sm"
									variant="secondary"
									className="flex-1"
									onClick={applyToAll}
								>
									Aplicar a todos os cortes
								</Button>
							)}
							<Button size="sm" variant="outline" onClick={remove}>
								Remover
							</Button>
						</div>
					</div>
				) : (
					<p className="text-muted-foreground mt-3 text-[11px]">
						Escolha uma transição para aplicar entre estes dois clipes.
					</p>
				)}
			</PopoverContent>
		</Popover>
	);
}
