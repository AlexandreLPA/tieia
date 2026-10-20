"use client";

import {
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { useEditor } from "@/hooks/use-editor";
import { useElementSelection } from "@/hooks/timeline/element/use-element-selection";
import { invokeAction } from "@/lib/actions";
import { isVisualElement } from "@/lib/timeline/element-utils";
import { usePreviewStore } from "@/stores/preview-store";

export function PreviewContextMenu({
	onToggleFullscreen,
	containerRef,
}: {
	onToggleFullscreen: () => void;
	containerRef: React.RefObject<HTMLElement | null>;
}) {
	const editor = useEditor();
	const { overlays, setOverlayVisibility, layoutGuide, toggleLayoutGuide } =
		usePreviewStore();
	const { selectedElements } = useElementSelection();
	const canFlip = editor.timeline
		.getElementsWithTracks({ elements: selectedElements })
		.some(({ element }) => isVisualElement(element));

	return (
		<ContextMenuContent className="w-56" container={containerRef.current}>
			<ContextMenuItem onClick={onToggleFullscreen} inset>
				Tela cheia
			</ContextMenuItem>
			<ContextMenuItem onClick={() => editor.renderer.saveSnapshot()} inset>
				Salvar snapshot
			</ContextMenuItem>
			<ContextMenuCheckboxItem
				checked={overlays.bookmarks}
				onCheckedChange={(checked) =>
					setOverlayVisibility({ overlay: "bookmarks", isVisible: !!checked })
				}
			>
				Mostrar favoritos
			</ContextMenuCheckboxItem>
			<ContextMenuCheckboxItem
				checked={layoutGuide.platform === "tiktok"}
				onCheckedChange={() => toggleLayoutGuide("tiktok")}
			>
				Guia do TikTok (só no preview)
			</ContextMenuCheckboxItem>
			<ContextMenuItem inset>Mostrar grade</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem
				inset
				disabled={!canFlip}
				onClick={() => invokeAction("flip-horizontal")}
			>
				Espelhar na horizontal
			</ContextMenuItem>
			<ContextMenuItem
				inset
				disabled={!canFlip}
				onClick={() => invokeAction("flip-vertical")}
			>
				Espelhar na vertical
			</ContextMenuItem>
		</ContextMenuContent>
	);
}
