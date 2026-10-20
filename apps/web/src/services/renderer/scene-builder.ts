import type {
	ImageElement,
	TimelineTrack,
	VideoElement,
} from "@/types/timeline";
import type { MediaAsset } from "@/types/assets";
import { RootNode } from "./nodes/root-node";
import { VideoNode } from "./nodes/video-node";
import { ImageNode } from "./nodes/image-node";
import { TextNode } from "./nodes/text-node";
import { StickerNode } from "./nodes/sticker-node";
import { ColorNode } from "./nodes/color-node";
import { CompositeEffectNode } from "./nodes/composite-effect-node";
import { EffectLayerNode } from "./nodes/effect-layer-node";
import { TransitionNode } from "./nodes/transition-node";
import type { BaseNode } from "./nodes/base-node";
import type { TBackground, TCanvasSize } from "@/types/project";
import { DEFAULT_BLUR_INTENSITY } from "@/constants/project-constants";
import { isMainTrack } from "@/lib/timeline";
import { getTransitionJunctions, hasTransition } from "@/lib/transitions";

const PREVIEW_MAX_IMAGE_SIZE = 2048;
const BLUR_BACKGROUND_ZOOM_SCALE = 1.4;

function getVisibleSortedElements({ track }: { track: TimelineTrack }) {
	return track.elements
		.filter((element) => !("hidden" in element && element.hidden))
		.slice()
		.sort((a, b) => {
			if (a.startTime !== b.startTime) return a.startTime - b.startTime;
			return a.id.localeCompare(b.id);
		});
}

function buildTrackNodes({
	tracks,
	mediaMap,
	canvasSize,
	isPreview,
	useProxy,
}: {
	tracks: TimelineTrack[];
	mediaMap: Map<string, MediaAsset>;
	canvasSize: TCanvasSize;
	isPreview?: boolean;
	useProxy?: boolean;
}): BaseNode[] {
	const nodes: BaseNode[] = [];

	for (const track of tracks) {
		const elements = getVisibleSortedElements({ track });

		for (const element of elements) {
			if (element.type === "effect") {
				nodes.push(
					new EffectLayerNode({
						effectType: element.effectType,
						effectParams: element.params,
						timeOffset: element.startTime,
						duration: element.duration,
					}),
				);
				continue;
			}

			if (element.type === "video" || element.type === "image") {
				const mediaAsset = mediaMap.get(element.mediaId);
				if (!mediaAsset?.file || !mediaAsset?.url) {
					continue;
				}

				const shouldUseProxy =
					useProxy &&
					isPreview &&
					mediaAsset.proxyFile &&
					mediaAsset.proxyUrl;

				const effectiveFile = shouldUseProxy
					? mediaAsset.proxyFile!
					: mediaAsset.file;
				const effectiveUrl = shouldUseProxy
					? mediaAsset.proxyUrl!
					: mediaAsset.url;

				if (mediaAsset.type === "video") {
					nodes.push(
						new VideoNode({
							mediaId: mediaAsset.id,
							url: effectiveUrl,
							file: effectiveFile,
							duration: element.duration,
							timeOffset: element.startTime,
							trimStart: element.trimStart,
							trimEnd: element.trimEnd,
							playbackRate:
								element.type === "video" ? element.playbackRate : undefined,
							transform: element.transform,
							animations: element.animations,
							opacity: element.opacity,
							blendMode: element.blendMode,
							effects: element.effects,
							fadeIn: element.fadeIn,
							fadeOut: element.fadeOut,
						}),
					);
				}
				if (mediaAsset.type === "image") {
					nodes.push(
						new ImageNode({
							url: mediaAsset.url,
							duration: element.duration,
							timeOffset: element.startTime,
							trimStart: element.trimStart,
							trimEnd: element.trimEnd,
							transform: element.transform,
							animations: element.animations,
							opacity: element.opacity,
							blendMode: element.blendMode,
							effects: element.effects,
							fadeIn: element.fadeIn,
							fadeOut: element.fadeOut,
							...(isPreview && {
								maxSourceSize: PREVIEW_MAX_IMAGE_SIZE,
							}),
						}),
					);
				}
			}

			if (element.type === "text") {
				nodes.push(
					new TextNode({
						...element,
						canvasCenter: { x: canvasSize.width / 2, y: canvasSize.height / 2 },
						canvasHeight: canvasSize.height,
						textBaseline: "middle",
						effects: element.effects,
					}),
				);
			}

			if (element.type === "sticker") {
				nodes.push(
					new StickerNode({
						stickerId: element.stickerId,
						duration: element.duration,
						timeOffset: element.startTime,
						trimStart: element.trimStart,
						trimEnd: element.trimEnd,
						transform: element.transform,
						animations: element.animations,
						opacity: element.opacity,
						blendMode: element.blendMode,
						effects: element.effects,
						fadeIn: element.fadeIn,
						fadeOut: element.fadeOut,
					}),
				);
			}
		}

		// Right above its own clips, so overlays on higher tracks stay on top
		nodes.push(
			...buildTrackTransitionNodes({ track, mediaMap, isPreview, useProxy }),
		);
	}

	return nodes;
}

export type BuildSceneParams = {
	canvasSize: TCanvasSize;
	tracks: TimelineTrack[];
	mediaAssets: MediaAsset[];
	duration: number;
	background: TBackground;
	isPreview?: boolean;
	useProxy?: boolean;
};

export function buildScene({
	canvasSize,
	tracks,
	mediaAssets,
	duration,
	background,
	isPreview,
	useProxy,
}: BuildSceneParams) {
	const rootNode = new RootNode({ duration });
	const mediaMap = new Map(mediaAssets.map((m) => [m.id, m]));

	const visibleTracks = tracks.filter(
		(track) => !("hidden" in track && track.hidden),
	);

	const orderedTracksTopToBottom = [
		...visibleTracks.filter((track) => !isMainTrack(track)),
		...visibleTracks.filter((track) => isMainTrack(track)),
	];

	const orderedTracksBottomToTop = orderedTracksTopToBottom.slice().reverse();

	const allNodes = buildTrackNodes({
		tracks: orderedTracksBottomToTop,
		mediaMap,
		canvasSize,
		isPreview,
		useProxy,
	});

	for (const backgroundNode of buildBackgroundNodes({
		background,
		allNodes,
	})) {
		rootNode.add(backgroundNode);
	}

	for (const node of allNodes) {
		rootNode.add(node);
	}

	return rootNode;
}

function buildBackgroundNodes({
	background,
	allNodes,
}: {
	background: TBackground;
	allNodes: BaseNode[];
}): BaseNode[] {
	const nodes: BaseNode[] = [];

	if (background.type === "blur") {
		nodes.push(
			new CompositeEffectNode({
				contentNodes: allNodes.filter(
					(node) => !(node instanceof EffectLayerNode),
				),
				effectType: "blur",
				effectParams: {
					intensity: background.blurIntensity ?? DEFAULT_BLUR_INTENSITY,
				},
				scale: BLUR_BACKGROUND_ZOOM_SCALE,
			}),
		);
	} else if (
		background.type === "color" &&
		background.color !== "transparent"
	) {
		nodes.push(new ColorNode({ color: background.color }));
	}

	return nodes;
}

function buildTrackTransitionNodes({
	track,
	mediaMap,
	isPreview,
	useProxy,
}: {
	track: TimelineTrack;
	mediaMap: Map<string, MediaAsset>;
	isPreview?: boolean;
	useProxy?: boolean;
}): TransitionNode[] {
	const transitionNodes: TransitionNode[] = [];

	for (const { from, to, cutTime } of getTransitionJunctions({ track })) {
		if (
			!from.transitionOut ||
			!hasTransition({ transitionType: from.transitionOut.type })
		) {
			continue;
		}

		const sources = new Map<string, { url: string; file?: File }>();
		for (const element of [from, to]) {
			const asset = mediaMap.get(element.mediaId);
			if (!asset?.file || !asset.url) continue;
			// Same proxy rule as the clip nodes, so both read from one decoder
			const proxyUrl = useProxy && isPreview ? asset.proxyUrl : undefined;
			const proxyFile = proxyUrl ? asset.proxyFile : undefined;
			sources.set(
				asset.id,
				proxyUrl && proxyFile
					? { url: proxyUrl, file: proxyFile }
					: { url: asset.url, file: asset.file },
			);
		}
		if (sources.size === 0) continue;

		const toSource = (element: VideoElement | ImageElement) => ({
			duration: element.duration,
			timeOffset: element.startTime,
			trimStart: element.trimStart,
			trimEnd: element.trimEnd,
			playbackRate: element.type === "video" ? element.playbackRate : undefined,
			transform: element.transform,
			animations: element.animations,
			opacity: element.opacity,
			blendMode: element.blendMode,
			effects: element.effects,
			mediaId: element.mediaId,
			mediaType: element.type,
		});

		transitionNodes.push(
			new TransitionNode({
				transitionType: from.transitionOut.type,
				transitionDuration: from.transitionOut.duration,
				cutTime,
				sourceA: toSource(from),
				sourceB: toSource(to),
				mediaMap: sources,
			}),
		);
	}

	return transitionNodes;
}
