/** "nvidia/nemotron-3.5-super-vl:free" -> "nemotron-3.5-super-vl (grátis)" */
export function shortModelName(modelId: string): string {
	const isFree = modelId.endsWith(":free");
	const name = modelId.replace(/:free$/, "").split("/").pop() || modelId;
	return isFree ? `${name} (grátis)` : name;
}
