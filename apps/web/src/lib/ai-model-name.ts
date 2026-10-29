import type { CloudModel } from "@/types/ai";

/** "nvidia/nemotron-3.5-super-vl:free" -> "nemotron-3.5-super-vl (grátis)" */
export function shortModelName(modelId: string): string {
	const isFree = modelId.endsWith(":free");
	const name =
		modelId
			.replace(/:free$/, "")
			.split("/")
			.pop() || modelId;
	return isFree ? `${name} (grátis)` : name;
}

const INPUT_LABELS: Record<string, string> = {
	text: "texto",
	image: "imagem",
	video: "vídeo",
	audio: "áudio",
	file: "arquivo",
};

/** 1_000_000 -> "1M", 262_144 -> "262K" */
function contextLabel(tokens: number): string {
	if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M`;
	return `${Math.round(tokens / 1000)}K`;
}

/** What a free cloud model offers, in the words of the setup guide. */
export function cloudModelSummary(model: CloudModel): string {
	const vendor = model.id.split("/")[0];
	// The catalog lists inputs in any order; text, image, video... reads better
	const order = Object.keys(INPUT_LABELS);
	const rank = (input: string) =>
		order.includes(input) ? order.indexOf(input) : order.length;
	const inputs = [...model.inputs]
		.sort((a, b) => rank(a) - rank(b))
		.map((input) => INPUT_LABELS[input] ?? input)
		.join("/");
	const parts = [vendor, "grátis"];
	if (model.context > 0)
		parts.push(`${contextLabel(model.context)} de contexto`);
	parts.push(`aceita ${inputs}`);
	const summary = parts.join(", ");
	return model.vision ? summary : `${summary} (não analisa quadros do vídeo)`;
}
