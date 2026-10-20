"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SendToTikTok } from "@/components/editor/send-to-tiktok";
import type { TCanvasSize } from "@/types/project";

/** Shown in the export popover once the file is saved: what's next. */
export function ExportDone({
	video,
	filename,
	canvasSize,
	canSendToTikTok,
	onDownloadAgain,
	onClose,
	onBusyChange,
}: {
	video: Blob;
	filename: string;
	canvasSize: TCanvasSize;
	/** False for audio-only exports, which TikTok can't take */
	canSendToTikTok: boolean;
	onDownloadAgain: () => void;
	onClose: () => void;
	onBusyChange: (busy: boolean) => void;
}) {
	return (
		<div className="flex flex-col">
			<div className="flex items-center gap-2 border-b p-3">
				<Check className="text-constructive size-4" />
				<h3 className="text-sm font-medium">Exportação concluída</h3>
			</div>
			<div className="flex flex-col gap-4 p-3">
				<p className="text-muted-foreground text-xs leading-relaxed">
					<span className="text-foreground break-all">{filename}</span> foi salvo
					na pasta Downloads.
				</p>
				{canSendToTikTok && (
					<SendToTikTok
						video={video}
						filename={filename}
						canvasSize={canvasSize}
						onDownloadAgain={onDownloadAgain}
						onBusyChange={onBusyChange}
					/>
				)}
				<Button variant="outline" className="w-full" onClick={onClose}>
					Fechar
				</Button>
			</div>
		</div>
	);
}
