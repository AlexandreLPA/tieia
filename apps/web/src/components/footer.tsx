"use client";

import Image from "next/image";
import Link from "next/link";
import { SOCIAL_LINKS, UPSTREAM_URL } from "@/constants/site-constants";
import { useLandingCopy } from "./landing/language-provider";

const footerLinks = [
	{ key: "editor", href: "/projects" },
	{ key: "models", href: "/models" },
	{ key: "roadmap", href: "/roadmap" },
	{ key: "changelog", href: "/changelog" },
	{ key: "contributors", href: "/contributors" },
	{ key: "privacy", href: "/privacy" },
	{ key: "terms", href: "/terms" },
] as const;

const linkClass =
	"text-muted-foreground hover:text-foreground rounded-sm text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden";

export function Footer() {
	const { nav, footer } = useLandingCopy();

	return (
		<footer className="border-t">
			<div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12 md:flex-row md:justify-between">
				<div className="max-w-sm">
					<div className="flex items-center gap-2.5">
						<TieiaLogo />
						<span className="text-base font-bold">TiêIA</span>
					</div>
					<p className="text-muted-foreground mt-4 text-sm leading-relaxed">
						{footer.about}{" "}
						<Link
							href="https://github.com/Ekaanth/OpenCut-AI"
							target="_blank"
							rel="noopener noreferrer"
							className="text-foreground underline decoration-1 underline-offset-4"
						>
							OpenCut AI
						</Link>
						{footer.aboutMiddle}{" "}
						<Link
							href={UPSTREAM_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="text-foreground underline decoration-1 underline-offset-4"
						>
							OpenCut
						</Link>
						.
					</p>
				</div>
				<nav aria-label={footer.label}>
					<ul className="grid grid-cols-2 gap-x-10 gap-y-2 sm:grid-cols-3">
						{footerLinks.map((link) => (
							<li key={link.href}>
								<Link href={link.href} className={linkClass}>
									{nav[link.key]}
								</Link>
							</li>
						))}
						<li>
							<Link
								href={SOCIAL_LINKS.github}
								target="_blank"
								rel="noopener noreferrer"
								className={linkClass}
							>
								GitHub
							</Link>
						</li>
					</ul>
				</nav>
			</div>
		</footer>
	);
}

export function TieiaLogo({ size = 26 }: { size?: number }) {
	return (
		<Image
			src="/icons/icon-192x192.png"
			alt=""
			aria-hidden="true"
			width={size}
			height={size}
			className="shrink-0"
		/>
	);
}
