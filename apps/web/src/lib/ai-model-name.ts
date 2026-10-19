/** "minimax/minimax-m3.1-flash:free" -> "minimax-m3.1-flash (grátis)" */
export function shortModelName(modelId: string): string {
	const isFree = modelId.endsWith(":free");
	const name = modelId.replace(/:free$/, "").split("/").pop() || modelId;
	return isFree ? `${name} (grátis)` : name;
}
