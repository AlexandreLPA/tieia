"use client";

import { useYouTubeReelsStore } from "@/stores/youtube-reels-store";
import { Button } from "@/components/ui/button";
import { YouTubeUrlInput } from "./url-input";
import { OwnershipDialog } from "./ownership-dialog";
import { VideoPreview } from "./video-preview";
import { ConfigPanel } from "./config-panel";
import { ProcessingProgress } from "./processing-progress";
import { ClipGrid } from "./clip-grid";
import { ExportPanel } from "./export-panel";

export function YouTubeReelsPanel() {
	const phase = useYouTubeReelsStore((s) => s.phase);
	const videoMeta = useYouTubeReelsStore((s) => s.videoMeta);
	const jobError = useYouTubeReelsStore((s) => s.jobError);
	const setPhase = useYouTubeReelsStore((s) => s.setPhase);
	const setVideoUrl = useYouTubeReelsStore((s) => s.setVideoUrl);
	const startIngestion = useYouTubeReelsStore((s) => s.startIngestion);
	const startAnalysis = useYouTubeReelsStore((s) => s.startAnalysis);
	const reset = useYouTubeReelsStore((s) => s.reset);

	return (
		<div className="space-y-4 p-1">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-semibold">YouTube para Reels</h2>
				{phase !== "idle" && phase !== "input" && (
					<Button variant="ghost" size="sm" className="text-xs h-7" onClick={reset}>
						Redefinir
					</Button>
				)}
			</div>

			{/* Phase: idle / input */}
			{(phase === "idle" || phase === "input") && (
				<>
					<p className="text-xs text-muted-foreground">
						Cole a URL do vídeo do YouTube para encontrar e gerar automaticamente clipes curtos e envolventes.
					</p>
					<YouTubeUrlInput
						onSubmit={(url) => {
							setVideoUrl(url);
							setPhase("confirming");
						}}
					/>
				</>
			)}

			{/* Phase: confirming ownership */}
			{phase === "confirming" && (
				<OwnershipDialog
					onConfirm={() => { startIngestion().catch(() => {}); }}
					onCancel={() => setPhase("input")}
				/>
			)}

			{/* Phase: processing (downloading / transcribing / analyzing / scoring) */}
			{phase === "processing" && (
				<>
					{videoMeta && <VideoPreview meta={videoMeta} />}
					<ProcessingProgress />
				</>
			)}

			{/* Phase: configuring (audio downloaded, set clip preferences) */}
			{phase === "configuring" && (
				<>
					{videoMeta && <VideoPreview meta={videoMeta} />}
					<ConfigPanel onStart={startAnalysis} />
				</>
			)}

			{/* Phase: reviewing (clips detected, user selects) */}
			{phase === "reviewing" && (
				<>
					{videoMeta && <VideoPreview meta={videoMeta} />}
					<ClipGrid />
				</>
			)}

			{/* Phase: exporting (generating reels) */}
			{phase === "exporting" && (
				<>
					{videoMeta && <VideoPreview meta={videoMeta} />}
					<ProcessingProgress />
				</>
			)}

			{/* Phase: done (reels ready for download) */}
			{phase === "done" && <ExportPanel />}

			{/* Phase: error */}
			{phase === "error" && (
				<div className="space-y-3">
					<div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
						<p className="text-sm text-red-400">{jobError || "Algo deu errado"}</p>
					</div>
					<Button variant="outline" size="sm" onClick={reset}>
						Tentar novamente
					</Button>
				</div>
			)}
		</div>
	);
}
