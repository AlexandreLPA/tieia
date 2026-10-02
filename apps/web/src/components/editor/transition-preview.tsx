"use client";

import { useEffect, useRef, useState } from "react";
import type { TransitionDefinition } from "@/lib/transitions";
import {
	PREVIEW_HEIGHT,
	PREVIEW_WIDTH,
	transitionPreviewer,
} from "@/services/renderer/transition-preview";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/ui";

export const TRANSITION_CATEGORY_LABELS: Record<string, string> = {
	dissolve: "Dissolvência",
	slide: "Deslizar",
	wipe: "Varredura",
	zoom: "Zoom",
	dip: "Fusão",
	iris: "Íris",
	morph: "Morph",
	distortion: "Distorção",
	burn: "Luz",
	peel: "Página",
	spin: "Giro",
	cube: "3D",
	pattern: "Padrão",
};

function normalize(text: string): string {
	return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Matches the name, category and keywords, ignoring accents and case. */
export function searchTransitions(
	transitions: TransitionDefinition[],
	query: string,
): TransitionDefinition[] {
	const terms = normalize(query).split(/\s+/).filter(Boolean);
	if (terms.length === 0) return transitions;
	return transitions.filter((transition) => {
		const haystack = normalize(
			[
				transition.name,
				TRANSITION_CATEGORY_LABELS[transition.category] ?? "",
				...transition.keywords,
			].join(" "),
		);
		return terms.every((term) => haystack.includes(term));
	});
}

/** Looping thumbnail of the transition going from sample clip A to B. */
export function TransitionPreview({
	transition,
	className,
}: {
	transition: TransitionDefinition;
	className?: string;
}) {
	const ref = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		return transitionPreviewer.subscribe({
			canvas,
			fragmentShader: transition.fragmentShader,
		});
	}, [transition.fragmentShader]);

	return (
		<canvas
			ref={ref}
			width={PREVIEW_WIDTH}
			height={PREVIEW_HEIGHT}
			aria-hidden
			className={cn("bg-muted aspect-video w-full rounded", className)}
		/>
	);
}

function TransitionTile({
	transition,
	selected,
	onPick,
}: {
	transition: TransitionDefinition;
	selected: boolean;
	onPick: (transition: TransitionDefinition) => void;
}) {
	return (
		<button
			type="button"
			title={transition.name}
			aria-pressed={selected}
			onClick={() => onPick(transition)}
			className={cn(
				"flex flex-col gap-1 rounded-md border p-1 text-left",
				"hover:bg-accent/60 focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none",
				selected && "border-primary bg-primary/10",
			)}
		>
			<TransitionPreview transition={transition} />
			<span className="w-full truncate px-0.5 text-[11px] leading-tight">
				{transition.name}
			</span>
		</button>
	);
}

/** Search box plus animated tiles; grouped by category unless searching. */
export function TransitionPicker({
	transitions,
	selectedType,
	onPick,
	grouped = false,
	gridClassName,
}: {
	transitions: TransitionDefinition[];
	selectedType?: string;
	onPick: (transition: TransitionDefinition) => void;
	grouped?: boolean;
	gridClassName?: string;
}) {
	const [query, setQuery] = useState("");
	const results = searchTransitions(transitions, query);
	const sections =
		grouped && !query.trim()
			? Array.from(new Set(results.map((t) => t.category))).map((category) => ({
					title: TRANSITION_CATEGORY_LABELS[category] ?? category,
					items: results.filter((t) => t.category === category),
				}))
			: [{ title: null, items: results }];

	return (
		<div className="flex min-h-0 flex-col gap-2">
			<Input
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				placeholder="Buscar: zoom, girar, preto, deslizar..."
				aria-label="Buscar transição"
				showClearIcon
				onClear={() => setQuery("")}
				className="h-8 text-xs"
			/>
			<div className={cn("min-h-0 overflow-y-auto pr-1", gridClassName)}>
				{results.length === 0 ? (
					<p className="text-muted-foreground py-6 text-center text-xs">
						Nenhuma transição com “{query.trim()}”.
					</p>
				) : (
					sections.map((section) => (
						<div key={section.title ?? "all"} className="mb-3 last:mb-0">
							{section.title && (
								<h3 className="text-muted-foreground mb-1.5 px-0.5 text-[11px] font-medium">
									{section.title}
								</h3>
							)}
							<div
								className="grid gap-1.5"
								style={{
									gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))",
								}}
							>
								{section.items.map((transition) => (
									<TransitionTile
										key={transition.type}
										transition={transition}
										selected={transition.type === selectedType}
										onPick={onPick}
									/>
								))}
							</div>
						</div>
					))
				)}
			</div>
		</div>
	);
}
