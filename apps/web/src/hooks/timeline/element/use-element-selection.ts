import { useCallback, useSyncExternalStore } from "react";
import { useEditor } from "@/hooks/use-editor";
import { expandRefsToGroups } from "@/lib/timeline/group-utils";

type ElementRef = { trackId: string; elementId: string };

export function useElementSelection() {
	const editor = useEditor();
	const selectedElements = useSyncExternalStore(
		(listener) => editor.selection.subscribe(listener),
		() => editor.selection.getSelectedElements(),
	);

	const isElementSelected = useCallback(
		({ trackId, elementId }: ElementRef) =>
			selectedElements.some(
				(element) =>
					element.trackId === trackId && element.elementId === elementId,
			),
		[selectedElements],
	);

	const selectElement = useCallback(
		({ trackId, elementId }: ElementRef) => {
			editor.selection.setSelectedElements({
				elements: [{ trackId, elementId }],
			});
		},
		[editor],
	);

	const addElementToSelection = useCallback(
		({ trackId, elementId }: ElementRef) => {
			const alreadySelected = selectedElements.some(
				(element) =>
					element.trackId === trackId && element.elementId === elementId,
			);
			if (alreadySelected) return;

			editor.selection.setSelectedElements({
				elements: [...selectedElements, { trackId, elementId }],
			});
		},
		[selectedElements, editor],
	);

	const removeElementFromSelection = useCallback(
		({ trackId, elementId }: ElementRef) => {
			// a grouped element leaves the selection together with its group
			const removed = expandRefsToGroups({
				tracks: editor.timeline.getTracks(),
				elements: [{ trackId, elementId }],
			});
			editor.selection.setSelectedElements({
				elements: selectedElements.filter(
					(element) =>
						!removed.some(
							(ref) =>
								ref.trackId === element.trackId &&
								ref.elementId === element.elementId,
						),
				),
			});
		},
		[selectedElements, editor],
	);

	const toggleElementSelection = useCallback(
		({ trackId, elementId }: ElementRef) => {
			const alreadySelected = selectedElements.some(
				(element) =>
					element.trackId === trackId && element.elementId === elementId,
			);

			if (alreadySelected) {
				removeElementFromSelection({ trackId, elementId });
			} else {
				addElementToSelection({ trackId, elementId });
			}
		},
		[selectedElements, addElementToSelection, removeElementFromSelection],
	);

	const clearElementSelection = useCallback(() => {
		editor.selection.clearSelection();
	}, [editor]);

	const setElementSelection = useCallback(
		({ elements }: { elements: ElementRef[] }) => {
			editor.selection.setSelectedElements({ elements });
		},
		[editor],
	);

	/**
	 * Handles click interaction on an element.
	 * - Regular click: select only this element
	 * - Multi-key click (Ctrl/Cmd): toggle this element in selection
	 */
	const handleElementClick = useCallback(
		({
			trackId,
			elementId,
			isMultiKey,
		}: ElementRef & { isMultiKey: boolean }) => {
			if (isMultiKey) {
				toggleElementSelection({ trackId, elementId });
			} else {
				selectElement({ trackId, elementId });
			}
		},
		[toggleElementSelection, selectElement],
	);

	return {
		selectedElements,
		isElementSelected,
		selectElement,
		setElementSelection,
		addElementToSelection,
		removeElementFromSelection,
		toggleElementSelection,
		clearElementSelection,
		handleElementClick,
	};
}
