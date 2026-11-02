"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useLandingCopy } from "./language-provider";

export function CopyCommand({ command }: { command: string }) {
	const { cta } = useLandingCopy();
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(command);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// clipboard blocked: the command stays selectable
		}
	};

	return (
		<div className="bg-background flex items-start justify-between gap-3 rounded-sm border px-4 py-3">
			<code className="overflow-x-auto font-mono text-[0.875rem] leading-relaxed whitespace-pre">
				{command}
			</code>
			<button
				type="button"
				onClick={copy}
				aria-label={copied ? cta.copied : cta.copyCommand}
				className="text-muted-foreground hover:text-foreground focus-visible:ring-tie shrink-0 rounded-sm p-1 transition-colors focus-visible:ring-2 focus-visible:outline-hidden"
			>
				{copied ? <Check className="size-4" /> : <Copy className="size-4" />}
			</button>
		</div>
	);
}
