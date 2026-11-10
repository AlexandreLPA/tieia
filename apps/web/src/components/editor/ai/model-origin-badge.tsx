import { cn } from "@/utils/ui";

/**
 * Where a model runs and whether it costs money. Every list of models shows
 * this beside the name, so the three kinds are never confused.
 */
export type ModelOrigin = "cloud-free" | "cloud-paid" | "local";

const ORIGINS: Record<ModelOrigin, { label: string; title: string }> = {
	"cloud-free": {
		label: "Nuvem · grátis",
		title: "Roda na nuvem e não cobra nada",
	},
	"cloud-paid": {
		label: "Nuvem · pago",
		title: "Roda na nuvem e é cobrado pelo provedor",
	},
	local: {
		label: "Local",
		title: "Roda no seu PC, sem custo; o primeiro uso baixa o modelo",
	},
};

export function ModelOriginBadge({
	origin,
	className,
}: {
	origin: ModelOrigin;
	className?: string;
}) {
	const { label, title } = ORIGINS[origin];
	return (
		<span
			title={title}
			className={cn(
				"shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] leading-none whitespace-nowrap",
				// Paid stands out: it is the only kind that can spend money
				origin === "cloud-paid"
					? "border border-yellow-500/50 text-yellow-600 dark:text-yellow-500"
					: "bg-accent text-muted-foreground",
				className,
			)}
		>
			{label}
		</span>
	);
}
