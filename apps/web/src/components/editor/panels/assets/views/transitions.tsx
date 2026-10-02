"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-view";
import {
	getAllTransitions,
	getMaxTransitionDuration,
	getTransitionJunctions,
	type TransitionDefinition,
} from "@/lib/transitions";
import { useEditor } from "@/hooks/use-editor";
import { AddTransitionCommand } from "@/lib/commands/timeline/element/transitions/add-transition";
import { TransitionPicker } from "@/components/editor/transition-preview";

export function TransitionsView() {
	const editor = useEditor();
	const transitions = getAllTransitions();

	const handleApply = useCallback(
		(transition: TransitionDefinition) => {
			const selected = editor.selection.getSelectedElements();
			if (selected.length === 0) {
				toast.info("Selecione um clipe na linha do tempo", {
					description: "Ou clique no + entre dois clipes.",
				});
				return;
			}

			const { elementId, trackId } = selected[0];
			const track = editor.timeline.getTracks().find((t) => t.id === trackId);
			const junction = track
				? getTransitionJunctions({ track }).find(
						(candidate) => candidate.from.id === elementId,
					)
				: undefined;
			if (!junction) {
				toast.info("Esse clipe não tem outro colado logo depois", {
					description: "A transição entra no corte entre dois clipes.",
				});
				return;
			}

			editor.command.execute({
				command: new AddTransitionCommand({
					trackId,
					elementId,
					transitionType: transition.type,
					duration: Math.min(
						transition.defaultDuration,
						getMaxTransitionDuration({ junction }),
					),
				}),
			});
		},
		[editor],
	);

	return (
		<PanelView title="Transições">
			<p className="text-[11px] text-muted-foreground px-1 pb-2">
				Passe o mouse entre dois clipes na linha do tempo e clique no + para
				escolher a transição daquele corte. Aqui, ela vai para o fim do clipe
				selecionado.
			</p>
			<TransitionPicker
				transitions={transitions}
				onPick={handleApply}
				grouped
			/>
		</PanelView>
	);
}
