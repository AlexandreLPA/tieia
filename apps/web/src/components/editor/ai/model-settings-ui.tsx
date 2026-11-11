import { cn } from "@/utils/ui";

/**
 * The pieces every model settings panel of the Estúdio is made of (chat,
 * Tiê Image, Tiê Video), so the three look and behave the same.
 */
export function Setting({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-xs font-medium">{label}</span>
			{children}
		</div>
	);
}

export function Segments<T extends string>({
	options,
	value,
	onChange,
	className,
}: {
	options: { id: T; label: string }[];
	value: string;
	onChange: (id: T) => void;
	className?: string;
}) {
	return (
		<div className={cn("bg-accent/60 flex w-fit rounded-md p-0.5", className)}>
			{options.map((option) => (
				<button
					key={option.id}
					type="button"
					aria-pressed={value === option.id}
					onClick={() => onChange(option.id)}
					className={cn(
						"text-muted-foreground hover:text-foreground flex-1 rounded-sm px-2.5 py-1 text-xs whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
						value === option.id && "bg-background text-foreground shadow-sm",
					)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

/** The line under a message field that says what will be used; opens the settings. */
export const SUMMARY_LINE_CLASS =
	"text-muted-foreground hover:text-foreground flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 gap-y-1 rounded-sm text-left text-[11px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden";

/** The settings panel that opens above a message field. */
export const SETTINGS_PANEL_CLASS =
	"flex max-h-[min(34rem,80vh)] w-[26rem] max-w-[calc(100vw-1rem)] flex-col gap-4 overflow-y-auto p-3";

/** The bordered list of models inside a settings panel. */
export const MODEL_LIST_CLASS =
	"flex max-h-60 flex-col overflow-y-auto rounded-md border p-1";

/** One model in that list. */
export const MODEL_ROW_CLASS =
	"hover:bg-accent flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left disabled:opacity-60";
