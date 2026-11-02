import { cn } from "@/utils/ui";

/**
 * The bird from the TiêIA icon as a single line (public/brand/tie-line.png,
 * cut from the icon artwork), painted with the brand red through a mask so
 * it follows the theme.
 */
export function TieLine({ className }: { className?: string }) {
	return (
		<div
			aria-hidden="true"
			className={cn("bg-tie aspect-[927/799] w-full", className)}
			style={{
				maskImage: "url(/brand/tie-line.png)",
				maskSize: "contain",
				maskRepeat: "no-repeat",
				maskPosition: "center",
				WebkitMaskImage: "url(/brand/tie-line.png)",
				WebkitMaskSize: "contain",
				WebkitMaskRepeat: "no-repeat",
				WebkitMaskPosition: "center",
			}}
		/>
	);
}
