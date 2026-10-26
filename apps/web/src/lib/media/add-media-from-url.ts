import type { EditorCore } from "@/core";
import { processMediaAssets } from "@/lib/media/processing";

export interface AddedMedia {
	mediaId: string;
	type: "image" | "video" | "audio";
	duration?: number;
}

/** Downloads a media file and registers it as a project asset. */
export async function addMediaFromUrl({
	editor,
	url,
	name,
}: {
	editor: EditorCore;
	url: string;
	name: string;
}): Promise<AddedMedia> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Falha ao baixar a mídia (${response.status})`);
	}
	const blob = await response.blob();
	const extension = blob.type.split("/")[1]?.split("+")[0] || "bin";
	const file = new File([blob], `${name}.${extension}`, { type: blob.type });

	const [processed] = await processMediaAssets({ files: [file] });
	if (!processed) {
		throw new Error("Formato de mídia não suportado");
	}

	const mediaId = await editor.media.addMediaAsset({
		projectId: editor.project.getActive().metadata.id,
		asset: processed,
	});
	return { mediaId, type: processed.type, duration: processed.duration };
}
