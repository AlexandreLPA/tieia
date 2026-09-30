"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MediaAsset } from "@/types/assets";
import type { VideoElement } from "@/types/timeline";
import { filmstripCache } from "@/services/video-cache/filmstrip";

// Very long clips at high zoom would otherwise mount thousands of tiles
const MAX_TILES = 240;

function FilmstripTile({
	mediaId,
	file,
	time,
	left,
	width,
}: {
	mediaId: string;
	file: File;
	time: number;
	left: number;
	width: number;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [url, setUrl] = useState(() => filmstripCache.peek(mediaId, time));

	useEffect(() => {
		const cached = filmstripCache.peek(mediaId, time);
		if (cached) {
			setUrl(cached);
			return;
		}
		const tile = ref.current;
		if (!tile) return;

		// Only decode tiles that are (almost) on screen
		let cancelled = false;
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				observer.disconnect();
				filmstripCache.request({ mediaId, file, time }).then((frame) => {
					if (!cancelled && frame) setUrl(frame);
				});
			},
			{ rootMargin: "200px" },
		);
		observer.observe(tile);
		return () => {
			cancelled = true;
			observer.disconnect();
		};
	}, [mediaId, file, time]);

	return (
		<div
			ref={ref}
			className="absolute inset-y-0 bg-cover bg-center"
			style={{
				left,
				width,
				backgroundImage: url ? `url(${url})` : undefined,
			}}
		/>
	);
}

/**
 * Real filmstrip for a video clip: each tile shows the frame at that point of
 * the clip (trim and speed included), decoded lazily and cached per video.
 * The import thumbnail shows underneath until each frame is ready.
 */
export function VideoFilmstrip({
	element,
	mediaAsset,
	trackHeight,
}: {
	element: VideoElement;
	mediaAsset: MediaAsset;
	trackHeight: number;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);

	useLayoutEffect(() => {
		const container = ref.current;
		if (!container) return;
		setWidth(container.clientWidth);
		const observer = new ResizeObserver(([entry]) =>
			setWidth(entry.contentRect.width),
		);
		observer.observe(container);
		return () => observer.disconnect();
	}, []);

	const aspect =
		mediaAsset.width && mediaAsset.height
			? Math.min(2.4, Math.max(0.4, mediaAsset.width / mediaAsset.height))
			: 16 / 9;
	const tileWidth = Math.max(16, trackHeight * aspect);
	const count =
		width > 0 && element.duration > 0
			? Math.min(MAX_TILES, Math.ceil(width / tileWidth))
			: 0;
	const secondsPerPixel = element.duration / Math.max(1, width);
	const rate = element.playbackRate ?? 1;
	// Proxies decode faster and look the same at thumbnail size
	const file = mediaAsset.proxyFile ?? mediaAsset.file;

	const tiles = Array.from({ length: count }, (_, index) => {
		const left = index * tileWidth;
		const offset = Math.min(
			element.duration,
			(left + tileWidth / 2) * secondsPerPixel,
		);
		const time = Math.round((element.trimStart + offset * rate) * 10) / 10;
		return { left, time };
	});

	return (
		<div
			ref={ref}
			className="pointer-events-none absolute inset-0 overflow-hidden"
			style={
				mediaAsset.thumbnailUrl
					? {
							backgroundImage: `url(${mediaAsset.thumbnailUrl})`,
							backgroundRepeat: "repeat-x",
							backgroundSize: `${tileWidth}px ${trackHeight}px`,
							backgroundPosition: "left center",
						}
					: undefined
			}
		>
			{tiles.map((tile) => (
				<FilmstripTile
					key={tile.left}
					mediaId={mediaAsset.id}
					file={file}
					time={tile.time}
					left={tile.left}
					width={tileWidth}
				/>
			))}
		</div>
	);
}
