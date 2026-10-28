"use client";

import { useEditor } from "@/hooks/use-editor";
import AudioWaveform from "../audio-waveform";
import {
	getTrackHeight,
} from "@/lib/timeline";
import type {
	TimelineElement as TimelineElementType,
	TimelineTrack,
	VisualElement,
} from "@/types/timeline";
import type { MediaAsset } from "@/types/assets";
import { VideoFilmstrip } from "@/components/editor/panels/timeline/video-filmstrip";
import { useElementSelection } from "@/hooks/timeline/element/use-element-selection";
import { resolveStickerId } from "@/lib/stickers";
import Image from "next/image";
import {
	MagicWand05Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { cn } from "@/utils/ui";
import { useCallback, useRef, } from "react";
import { Button } from "@/components/ui/button";
import { usePropertiesStore } from "@/stores/properties-store";

export interface ElementContentProps {
	element: TimelineElementType;
	track: TimelineTrack;
	isSelected: boolean;
}

interface ElementContentRendererProps extends ElementContentProps {
	mediaAssets: MediaAsset[];
	editor: ReturnType<typeof useEditor>;
}

type ElementContentRenderer = (props: ElementContentRendererProps) => ReactNode;

export function renderTiledMedia({
	element,
	imageUrl,
	track,
}: {
	element: VisualElement;
	imageUrl: string | undefined;
	track: ElementContentProps["track"];
}): ReactNode {
	if (!imageUrl) {
		return (
			<span className="text-foreground/80 truncate text-xs">
				{element.name}
			</span>
		);
	}

	const trackHeight = getTrackHeight({ type: track.type });
	const tileWidth = trackHeight * (16 / 9);

	return (
		<div
			className="absolute inset-0"
			style={{
				backgroundImage: `url(${imageUrl})`,
				backgroundRepeat: "repeat-x",
				backgroundSize: `${tileWidth}px ${trackHeight}px`,
				backgroundPosition: "left center",
				pointerEvents: "none",
			}}
		/>
	);
}

export function EffectsButton({
	element,
	trackId,
	className,
}: {
	element: VisualElement;
	trackId: string;
	className?: string;
}) {
	const openClipEffects = usePropertiesStore((state) => state.openClipEffects);
	const { selectElement } = useElementSelection();

	if (!element.effects?.length) {
		return null;
	}

	const handleClick = (event: React.MouseEvent) => {
		event.stopPropagation();
		selectElement({ elementId: element.id, trackId });
		openClipEffects({ elementId: element.id, trackId });
	};

	return (
		<Button
			variant="text"
			size="icon"
			className={cn("rounded-sm !size-5 bg-black/50 text-white", className)}
			onClick={handleClick}
			onMouseDown={(event) => event.stopPropagation()}
		>
			<HugeiconsIcon icon={MagicWand05Icon} />
		</Button>
	);
}

function AudioVolumeLine({
	volume,
	volumeDb,
	volumePercent,
	onVolumeChange,
	onVolumeCommit,
}: {
	volume: number;
	volumeDb: number;
	volumePercent: number;
	onVolumeChange: (v: number) => void;
	onVolumeCommit: (v: number) => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const isDragging = useRef(false);
	const startVolume = useRef(volume);

	const calcVolume = useCallback((e: MouseEvent) => {
		const container = containerRef.current;
		if (!container) return volume;
		const rect = container.getBoundingClientRect();
		const y = e.clientY - rect.top;
		const ratio = 1 - Math.max(0, Math.min(1, y / rect.height));
		return Math.round(ratio * 100) / 100;
	}, [volume]);

	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		// Only start volume drag if the click is near the volume line (within 6px)
		const container = containerRef.current;
		if (!container) return;
		const rect = container.getBoundingClientRect();
		const lineY = rect.top + rect.height * (1 - (volumePercent / 100));
		const distanceFromLine = Math.abs(e.clientY - lineY);
		if (distanceFromLine > 6) return;

		e.stopPropagation();
		e.preventDefault();
		isDragging.current = true;
		startVolume.current = volume;

		const handleMove = (ev: MouseEvent) => {
			if (!isDragging.current) return;
			onVolumeChange(calcVolume(ev));
		};

		const handleUp = (ev: MouseEvent) => {
			if (!isDragging.current) return;
			isDragging.current = false;
			onVolumeCommit(calcVolume(ev));
			window.removeEventListener("mousemove", handleMove);
			window.removeEventListener("mouseup", handleUp);
		};

		window.addEventListener("mousemove", handleMove);
		window.addEventListener("mouseup", handleUp);
	}, [volume, volumePercent, onVolumeChange, onVolumeCommit, calcVolume]);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: pointer-only volume drag surface; keyboard volume control is out of scope for this change
		<div
			ref={containerRef}
			className="absolute inset-0 z-10"
			onMouseDown={handleMouseDown}
			style={{ cursor: "ns-resize" }}
		>
			{/* Volume level line */}
			<div
				className="absolute left-0 right-0 border-t-2 border-yellow-400/80 pointer-events-none transition-[top] duration-75"
				style={{ top: `${100 - volumePercent}%` }}
			>
				{/* dB label */}
				<span className="absolute right-1 -top-3.5 text-[9px] font-mono text-yellow-400/90 pointer-events-none select-none">
					{volumeDb > -60 ? `${volumeDb} dB` : "-∞ dB"}
				</span>
			</div>
		</div>
	);
}

const ELEMENT_CONTENT_RENDERERS: Record<
	TimelineElementType["type"],
	ElementContentRenderer
> = {
	text: ({ element }) => {
		const textElement = element as Extract<
			TimelineElementType,
			{ type: "text" }
		>;
		return (
			<div className="flex size-full items-center justify-start pl-2">
				<span className="truncate text-xs text-white">
					{textElement.content}
				</span>
			</div>
		);
	},
	effect: ({ element }) => (
		<div className="flex size-full items-center justify-start gap-1 pl-2">
			<HugeiconsIcon
				icon={MagicWand05Icon}
				className="size-4 shrink-0 text-white"
			/>
			<span className="truncate text-xs text-white ml-1">{element.name}</span>
		</div>
	),
	sticker: ({ element }) => {
		const stickerElement = element as Extract<
			TimelineElementType,
			{ type: "sticker" }
		>;
		return (
			<div className="flex size-full items-center gap-2 pl-2">
				<Image
					src={resolveStickerId({
						stickerId: stickerElement.stickerId,
						options: { width: 20, height: 20 },
					})}
					alt={stickerElement.name}
					className="size-5 shrink-0"
					width={20}
					height={20}
					unoptimized
				/>
				<span className="truncate text-xs text-white">
					{stickerElement.name}
				</span>
			</div>
		);
	},
	audio: ({ element, track, mediaAssets, editor }) => {
		const audioElement = element as Extract<
			TimelineElementType,
			{ type: "audio" }
		>;
		const audioBuffer =
			audioElement.sourceType === "library" ? audioElement.buffer : undefined;
		const audioUrl =
			audioElement.sourceType === "library"
				? audioElement.sourceUrl
				: mediaAssets.find((asset) => asset.id === audioElement.mediaId)?.url;

		const volume = audioElement.volume ?? 1;
		const volumeDb = volume > 0 ? Math.round(20 * Math.log10(volume)) : -60;
		const volumePercent = Math.min(volume, 1) * 100;

		return (
			<div className="relative flex size-full items-center gap-2">
				{(audioBuffer || audioUrl) && (
					<div className="min-w-0 flex-1 opacity-60">
						<AudioWaveform
							audioBuffer={audioBuffer}
							audioUrl={audioUrl}
							height={24}
							className="w-full"
						/>
					</div>
				)}
				{!audioBuffer && !audioUrl && (
					<span className="text-foreground/80 truncate text-xs">
						{audioElement.name}
					</span>
				)}

				{/* Volume line — draggable */}
				<AudioVolumeLine
					volume={volume}
					volumeDb={volumeDb}
					volumePercent={volumePercent}
					onVolumeChange={(newVolume) => {
						editor.timeline.updateElements({
							updates: [{
								trackId: track.id,
								elementId: element.id,
								updates: { volume: newVolume },
							}],
							pushHistory: false,
						});
					}}
					onVolumeCommit={(newVolume) => {
						editor.timeline.updateElements({
							updates: [{
								trackId: track.id,
								elementId: element.id,
								updates: { volume: newVolume },
							}],
							pushHistory: true,
						});
					}}
				/>
			</div>
		);
	},
	video: ({ element, track, mediaAssets }) => {
		const videoElement = element as Extract<
			TimelineElementType,
			{ type: "video" }
		>;
		const mediaAsset = mediaAssets.find(
			(asset) => asset.id === videoElement.mediaId,
		);
		if (mediaAsset?.file) {
			return (
				<VideoFilmstrip
					element={videoElement}
					mediaAsset={mediaAsset}
					trackHeight={getTrackHeight({ type: track.type })}
				/>
			);
		}
		return renderTiledMedia({
			element: videoElement,
			imageUrl: mediaAsset?.thumbnailUrl,
			track,
		});
	},
	image: ({ element, track, mediaAssets }) => {
		const imageElement = element as Extract<
			TimelineElementType,
			{ type: "image" }
		>;
		const mediaAsset = mediaAssets.find(
			(asset) => asset.id === imageElement.mediaId,
		);
		return renderTiledMedia({
			element: imageElement,
			imageUrl: mediaAsset?.url,
			track,
		});
	},
};

export function ElementContent({ element, track, isSelected }: ElementContentProps) {
	const editor = useEditor();
	const renderer = ELEMENT_CONTENT_RENDERERS[element.type];
	return (
		<>
			{renderer({
				element,
				track,
				isSelected,
				mediaAssets: editor.media.getAssets(),
				editor,
			})}
		</>
	);
}
