"use client";

import { cn } from "@/utils/ui";
import { LANDING_LANGUAGES } from "./i18n";
import { useLandingCopy, useLandingLanguage } from "./language-provider";

/** PT / EN / ES in the header. Renders nothing outside the landing. */
export function LanguageSwitcher({ className }: { className?: string }) {
	const value = useLandingLanguage();
	const copy = useLandingCopy();
	if (!value) return null;

	return (
		<fieldset className={cn("m-0 flex items-center border-0 p-0", className)}>
			<legend className="sr-only">{copy.nav.language}</legend>
			{LANDING_LANGUAGES.map((option) => {
				const active = option.code === value.language;
				return (
					<button
						key={option.code}
						type="button"
						lang={option.htmlLang}
						title={option.name}
						aria-pressed={active}
						onClick={() => value.setLanguage(option.code)}
						className={cn(
							"h-9 rounded-sm px-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
							active
								? "text-foreground font-semibold underline decoration-1 underline-offset-4"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{option.short}
					</button>
				);
			})}
		</fieldset>
	);
}
