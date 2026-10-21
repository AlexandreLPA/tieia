import { cn } from "@/utils/ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { statusBadge, type ServiceState } from "./helpers";

export function ServiceCard({
	title,
	status,
	detail,
	children,
}: {
	title: string;
	status: ServiceState;
	detail: string;
	children?: React.ReactNode;
}) {
	const badge = statusBadge(status);

	return (
		<Card className="rounded-lg">
			<CardContent className="p-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<span className={cn("size-2 rounded-full shrink-0", badge.dotColor)} />
						<span className="text-xs font-medium">{title}</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-[11px] text-muted-foreground">{detail}</span>
						<Badge
							variant={badge.variant}
							className="text-[9px] px-1.5 py-0"
						>
							{badge.label}
						</Badge>
					</div>
				</div>
				{children}
			</CardContent>
		</Card>
	);
}

export function CommandBlock({ label, command }: { label: string; command: string }) {
	return (
		<div className="mt-1">
			<span className="text-[10px] text-muted-foreground">{label}:</span>
			<code className="block text-[11px] font-mono bg-muted rounded px-2 py-1 mt-0.5 text-muted-foreground select-all">
				{command}
			</code>
		</div>
	);
}
