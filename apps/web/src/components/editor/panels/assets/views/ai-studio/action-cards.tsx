import { cn } from "@/utils/ui";
import { Button } from "@/components/ui/button";
import { describeAction } from "@/lib/ai-editor-actions";
import type { StudioActionState } from "@/stores/ai-store";

const ACTION_STATUS_STYLES: Record<StudioActionState["status"], string> = {
	pendente: "border-border",
	aplicada: "border-green-500/30 bg-green-500/5",
	falhou: "border-red-500/30 bg-red-500/5",
};

export function ActionCards({
	states,
	onApply,
	onApplyAll,
}: {
	states: StudioActionState[];
	onApply: (index: number) => void;
	onApplyAll: () => void;
}) {
	const pending = states.filter((s) => s.status === "pendente").length;
	return (
		<div className="mt-2 space-y-1.5">
			<p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
				Mudanças sugeridas
			</p>
			{states.map((state, index) => (
				<div
					key={`${JSON.stringify(state.action)}-${state.status}`}
					className={cn(
						"flex items-start gap-2 rounded-md border bg-background/60 px-2 py-1.5",
						ACTION_STATUS_STYLES[state.status],
					)}
				>
					<div className="min-w-0 flex-1 text-[11px] leading-snug">
						<p>{describeAction(state.action)}</p>
						{state.detail && (
							<p
								className={cn(
									"mt-0.5 text-[10px]",
									state.status === "falhou" ? "text-red-400" : "text-muted-foreground",
								)}
							>
								{state.detail}
							</p>
						)}
					</div>
					{state.status === "pendente" ? (
						<Button size="sm" className="h-6 shrink-0 px-2 text-[10px]" onClick={() => onApply(index)}>
							Aplicar
						</Button>
					) : (
						<span
							className={cn(
								"shrink-0 text-[10px] font-medium",
								state.status === "aplicada" ? "text-green-500" : "text-red-400",
							)}
						>
							{state.status === "aplicada" ? "✓ Aplicada" : "Falhou"}
						</span>
					)}
				</div>
			))}
			{pending > 1 && (
				<Button variant="outline" size="sm" className="h-6 w-full text-[10px]" onClick={onApplyAll}>
					Aplicar todas ({pending})
				</Button>
			)}
			<p className="text-[10px] text-muted-foreground">
				Nada muda até você clicar em Aplicar. Ctrl+Z desfaz cada ação.
			</p>
		</div>
	);
}
