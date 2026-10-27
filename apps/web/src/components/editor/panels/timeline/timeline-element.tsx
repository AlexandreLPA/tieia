"use client";

import { useEditor } from "@/hooks/use-editor";
import { useAssetsPanelStore } from "@/stores/assets-panel-store";
import { useTimelineElementResize } from "@/hooks/timeline/element/use-element-resize";
import {
	useKeyframeDrag,
} from "@/hooks/timeline/element/use-keyframe-drag";
import type { SnapPoint } from "@/lib/timeline/snap-utils";
import { getElementKeyframes } from "@/lib/animation";
import {
	getTrackClasses,
	canElementHaveAudio,
	canElementBeHidden,
	hasMediaId,
	hasSeparatedAudio,
	timelineTimeToPixels,
	timelineTimeToSnappedPixels,
} from "@/lib/timeline";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type {
	TimelineElement as TimelineElementType,
	TimelineTrack,
	VisualElement,
	ElementDragState,
} from "@/types/timeline";
import type { MediaAsset } from "@/types/assets";
import { mediaSupportsAudio } from "@/lib/media/media-utils";
import { useElementSelection } from "@/hooks/timeline/element/use-element-selection";
import { canRemoveSilences } from "@/lib/timeline/remove-silences";
import {
	ScissorIcon,
	Copy01Icon,
	Search01Icon,
	Exchange01Icon,
	GroupItemsIcon,
	UngroupItemsIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/utils/ui";
import { usePropertiesStore } from "@/stores/properties-store";
import { KeyframeIndicators, getKeyframeIndicators, ELEMENT_RING_WIDTH_PX, } from "./timeline-element/keyframe-indicators";
import { EffectsButton, ElementContent } from "./timeline-element/element-content";
import { ActionMenuItem, CopyMenuItem, DeleteMenuItem, MuteMenuItem, RemoveSilencesMenuItem, SeparateAudioMenuItem, VisibilityMenuItem, } from "./timeline-element/menu-items";

interface TimelineElementProps {
	element: TimelineElementType;
	track: TimelineTrack;
	zoomLevel: number;
	isSelected: boolean;
	onSnapPointChange?: (snapPoint: SnapPoint | null) => void;
	onResizeStateChange?: (params: { isResizing: boolean }) => void;
	onElementMouseDown: (
		event: React.MouseEvent,
		element: TimelineElementType,
	) => void;
	onElementClick: (
		event: React.MouseEvent,
		element: TimelineElementType,
	) => void;
	dragState: ElementDragState;
	isDropTarget?: boolean;
}

export function TimelineElement({
	element,
	track,
	zoomLevel,
	isSelected,
	onSnapPointChange,
	onResizeStateChange,
	onElementMouseDown,
	onElementClick,
	dragState,
	isDropTarget = false,
}: TimelineElementProps) {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	const { requestRevealMedia } = useAssetsPanelStore();

	let mediaAsset: MediaAsset | null = null;

	if (hasMediaId(element)) {
		mediaAsset =
			editor.media.getAssets().find((asset) => asset.id === element.mediaId) ??
			null;
	}

	const hasAudio = mediaSupportsAudio({ media: mediaAsset });

	const { handleResizeStart, isResizing, currentStartTime, currentDuration } =
		useTimelineElementResize({
			element,
			track,
			zoomLevel,
			onSnapPointChange,
			onResizeStateChange,
		});

	const isCurrentElementSelected = selectedElements.some(
		(selected) =>
			selected.elementId === element.id && selected.trackId === track.id,
	);

	const isBeingDragged = dragState.elementId === element.id;
	const dragOffsetY =
		isBeingDragged && dragState.isDragging
			? dragState.currentMouseY - dragState.startMouseY
			: 0;
	// the rest of a dragged element's group follows it in time
	const isFollowingGroupDrag =
		dragState.isDragging &&
		!isBeingDragged &&
		element.groupId !== undefined &&
		element.groupId === dragState.groupId;
	const elementStartTime =
		isBeingDragged && dragState.isDragging
			? dragState.currentTime
			: isFollowingGroupDrag
				? Math.max(
						0,
						element.startTime +
							dragState.currentTime -
							dragState.startElementTime,
					)
				: element.startTime;
	const displayedStartTime = isResizing ? currentStartTime : elementStartTime;
	const displayedDuration = isResizing ? currentDuration : element.duration;
	const elementWidth = timelineTimeToPixels({
		time: displayedDuration,
		zoomLevel,
	});
	const elementLeft = timelineTimeToSnappedPixels({
		time: displayedStartTime,
		zoomLevel,
	});
	const keyframeIndicators = isSelected
		? getKeyframeIndicators({
				keyframes: getElementKeyframes({ animations: element.animations }),
				trackId: track.id,
				elementId: element.id,
				displayedStartTime,
				zoomLevel,
				elementLeft,
				elementWidth,
			})
		: [];

	const {
		keyframeDragState,
		handleKeyframeMouseDown,
		handleKeyframeClick,
		getVisualOffsetPx,
	} = useKeyframeDrag({ zoomLevel, element, displayedStartTime });
	const handleRevealInMedia = ({ event }: { event: React.MouseEvent }) => {
		event.stopPropagation();
		if (hasMediaId(element)) {
			requestRevealMedia(element.mediaId);
		}
	};

	const isMuted = canElementHaveAudio(element) && element.muted === true;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					className="absolute top-0 h-full select-none"
					style={{
						left: `${elementLeft}px`,
						width: `${elementWidth}px`,
						transform:
							isBeingDragged && dragState.isDragging
								? `translate3d(0, ${dragOffsetY}px, 0)`
								: undefined,
					}}
				>
					<ElementInner
						element={element}
						track={track}
						isSelected={isSelected}
						onElementClick={onElementClick}
						onElementMouseDown={onElementMouseDown}
						handleResizeStart={handleResizeStart}
						isDropTarget={isDropTarget}
					/>
					{isSelected && (
						<div className="pointer-events-none absolute inset-0 overflow-hidden">
							<KeyframeIndicators
								indicators={keyframeIndicators}
								dragState={keyframeDragState}
								displayedStartTime={displayedStartTime}
								elementLeft={elementLeft}
								onKeyframeMouseDown={handleKeyframeMouseDown}
								onKeyframeClick={handleKeyframeClick}
								getVisualOffsetPx={getVisualOffsetPx}
							/>
						</div>
					)}
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent className="w-64">
				<ActionMenuItem
					action="split"
					icon={<HugeiconsIcon icon={ScissorIcon} />}
				>
					Dividir
				</ActionMenuItem>
				<CopyMenuItem />
				{canElementHaveAudio(element) && hasAudio && (
					<MuteMenuItem
						isMultipleSelected={selectedElements.length > 1}
						isCurrentElementSelected={isCurrentElementSelected}
						isMuted={isMuted}
					/>
				)}
				{element.type === "video" && hasAudio && (
					<SeparateAudioMenuItem
						isSeparated={hasSeparatedAudio({
							tracks: editor.timeline.getTracks(),
							element,
						})}
					/>
				)}
				{selectedElements.length === 1 &&
					canRemoveSilences(element) &&
					hasAudio && <RemoveSilencesMenuItem />}
				{canElementBeHidden(element) && (
					<VisibilityMenuItem
						element={element}
						isMultipleSelected={selectedElements.length > 1}
						isCurrentElementSelected={isCurrentElementSelected}
					/>
				)}
				{selectedElements.length === 1 && (
					<ActionMenuItem
						action="duplicate-selected"
						icon={<HugeiconsIcon icon={Copy01Icon} />}
					>
						Duplicar
					</ActionMenuItem>
				)}
				{selectedElements.length === 1 && hasMediaId(element) && (
					<>
						<ContextMenuItem
							icon={<HugeiconsIcon icon={Search01Icon} />}
							onClick={(event: React.MouseEvent) =>
								handleRevealInMedia({ event })
							}
						>
							Localizar mídia
						</ContextMenuItem>
						<ContextMenuItem
							icon={<HugeiconsIcon icon={Exchange01Icon} />}
							disabled
						>
							Substituir mídia
						</ContextMenuItem>
					</>
				)}
				{selectedElements.length > 1 &&
					isCurrentElementSelected &&
					!isWholeSelectionOneGroup({
						tracks: editor.timeline.getTracks(),
						selectedElements,
					}) && (
						<ActionMenuItem
							action="group-selected"
							icon={<HugeiconsIcon icon={GroupItemsIcon} />}
						>
							Agrupar
						</ActionMenuItem>
					)}
				{element.groupId && (
					<ActionMenuItem
						action="ungroup-selected"
						icon={<HugeiconsIcon icon={UngroupItemsIcon} />}
					>
						Desagrupar
					</ActionMenuItem>
				)}
				<ContextMenuSeparator />
				<DeleteMenuItem
					isMultipleSelected={selectedElements.length > 1}
					isCurrentElementSelected={isCurrentElementSelected}
					elementType={element.type}
					selectedCount={selectedElements.length}
				/>
			</ContextMenuContent>
		</ContextMenu>
	);
}

function ElementInner({
	element,
	track,
	isSelected,
	onElementClick,
	onElementMouseDown,
	handleResizeStart,
	isDropTarget = false,
}: {
	element: TimelineElementType;
	track: TimelineTrack;
	isSelected: boolean;
	onElementClick: (
		event: React.MouseEvent,
		element: TimelineElementType,
	) => void;
	onElementMouseDown: (
		event: React.MouseEvent,
		element: TimelineElementType,
	) => void;
	handleResizeStart: (params: {
		event: React.MouseEvent;
		elementId: string;
		side: "left" | "right";
	}) => void;
	isDropTarget?: boolean;
}) {
	const opacityClass =
		(canElementBeHidden(element) && element.hidden) || isDropTarget
			? "opacity-50"
			: "";
	const closeClipEffects = usePropertiesStore(
		(state) => state.closeClipEffects,
	);

	return (
		<div
			className="relative h-full cursor-pointer"
			style={{ marginInline: ELEMENT_RING_WIDTH_PX }}
		>
			<div
				className={cn(
					"absolute inset-0 overflow-hidden rounded-sm",
					getTrackClasses({ type: track.type }),
					opacityClass,
				)}
				style={
					isSelected
						? {
								boxShadow: `0 0 0 ${ELEMENT_RING_WIDTH_PX}px var(--foreground)`,
							}
						: undefined
				}
			>
				<button
					type="button"
					className="absolute inset-0 size-full cursor-pointer flex flex-col"
					onClick={(event) => {
						closeClipEffects();
						onElementClick(event, element);
					}}
					onMouseDown={(event) => onElementMouseDown(event, element)}
				>
					<div className="flex flex-1 min-h-0 items-center overflow-hidden">
						<ElementContent
							element={element}
							track={track}
							isSelected={isSelected}
						/>
					</div>
				</button>
				{element.groupId && (
					<div
						className="pointer-events-none absolute top-0.5 right-1 rounded-sm bg-black/50 p-0.5 text-white"
						title="Agrupado"
					>
						<HugeiconsIcon icon={GroupItemsIcon} className="size-3" />
					</div>
				)}
			</div>

			{element.type !== "audio" && element.type !== "effect" && (
				<div className="sticky left-1 mt-1 ml-1 w-fit">
					<EffectsButton
						element={element as VisualElement}
						trackId={track.id}
					/>
				</div>
			)}

			{isSelected && (
				<>
					<ResizeHandle
						side="left"
						elementId={element.id}
						handleResizeStart={handleResizeStart}
					/>
					<ResizeHandle
						side="right"
						elementId={element.id}
						handleResizeStart={handleResizeStart}
					/>
				</>
			)}
		</div>
	);
}

function ResizeHandle({
	side,
	elementId,
	handleResizeStart,
}: {
	side: "left" | "right";
	elementId: string;
	handleResizeStart: (params: {
		event: React.MouseEvent;
		elementId: string;
		side: "left" | "right";
	}) => void;
}) {
	const isLeft = side === "left";
	return (
		<button
			type="button"
			className={cn(
				"absolute top-0 bottom-0 w-2",
				isLeft ? "-left-1 cursor-w-resize" : "-right-1 cursor-e-resize",
			)}
			onMouseDown={(event) => handleResizeStart({ event, elementId, side })}
			onClick={(event) => event.stopPropagation()}
			aria-label={`Alça de redimensionamento à ${isLeft ? "esquerda" : "direita"}`}
		></button>
	);
}

function isWholeSelectionOneGroup({
	tracks,
	selectedElements,
}: {
	tracks: TimelineTrack[];
	selectedElements: { trackId: string; elementId: string }[];
}): boolean {
	const groupIds = new Set(
		selectedElements.map(
			({ trackId, elementId }) =>
				tracks
					.find((track) => track.id === trackId)
					?.elements.find((trackElement) => trackElement.id === elementId)
					?.groupId,
		),
	);
	const [onlyGroupId] = groupIds;
	return groupIds.size === 1 && onlyGroupId !== undefined;
}
