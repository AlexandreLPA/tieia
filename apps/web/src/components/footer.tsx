import Image from "next/image";
import Link from "next/link";
import { RiTwitterXLine } from "react-icons/ri";
import { FaGithub } from "react-icons/fa6";
import { SOCIAL_LINKS, UPSTREAM_URL } from "@/constants/site-constants";

const footerLinks = {
	product: [
		{ label: "Editor", href: "/projects" },
		{ label: "Models", href: "/models" },
		{ label: "Roadmap", href: "/roadmap" },
		{ label: "Changelog", href: "/changelog" },
	],
	resources: [
		{ label: "GitHub", href: SOCIAL_LINKS.github },
		{ label: "Contributors", href: "/contributors" },
	],
	legal: [
		{ label: "Privacy", href: "/privacy" },
		{ label: "Terms of use", href: "/terms" },
	],
};

export function Footer() {
	return (
		<footer className="border-t">
			<div className="mx-auto max-w-5xl px-8 py-12">
				<div className="grid grid-cols-1 gap-10 md:grid-cols-[1.5fr_1fr_1fr_0.8fr]">
					{/* Brand */}
					<div className="max-w-xs">
						<div className="mb-4 flex items-center gap-2.5">
							<TieiaLogo />
							<span className="text-base font-bold tracking-tight">TiêIA</span>
						</div>
						<p className="text-muted-foreground text-sm leading-relaxed">
							Open-source AI video editor. Transcribe, edit by text,
							clone voices, and generate visuals. Runs locally on your machine.
						</p>
						<div className="mt-5 flex gap-3">
							<Link
								href={SOCIAL_LINKS.github}
								className="text-muted-foreground hover:text-foreground transition-colors"
								target="_blank"
								rel="noopener noreferrer"
								aria-label="GitHub"
							>
								<FaGithub className="size-[18px]" />
							</Link>
							<Link
								href={SOCIAL_LINKS.x}
								className="text-muted-foreground hover:text-foreground transition-colors"
								target="_blank"
								rel="noopener noreferrer"
								aria-label="X / Twitter"
							>
								<RiTwitterXLine className="size-[18px]" />
							</Link>
						</div>
					</div>

					{/* Product links */}
					<div>
						<h3 className="text-sm font-semibold mb-3">Product</h3>
						<ul className="space-y-2">
							{footerLinks.product.map((link) => (
								<li key={link.href}>
									<Link
										href={link.href}
										className="text-sm text-muted-foreground hover:text-foreground transition-colors"
									>
										{link.label}
									</Link>
								</li>
							))}
						</ul>
					</div>

					{/* Resources links */}
					<div>
						<h3 className="text-sm font-semibold mb-3">Resources</h3>
						<ul className="space-y-2">
							{footerLinks.resources.map((link) => (
								<li key={link.href}>
									<Link
										href={link.href}
										className="text-sm text-muted-foreground hover:text-foreground transition-colors"
										target={link.href.startsWith("http") ? "_blank" : undefined}
										rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
									>
										{link.label}
									</Link>
								</li>
							))}
						</ul>
					</div>

					{/* Legal links */}
					<div>
						<h3 className="text-sm font-semibold mb-3">Legal</h3>
						<ul className="space-y-2">
							{footerLinks.legal.map((link) => (
								<li key={link.href}>
									<Link
										href={link.href}
										className="text-sm text-muted-foreground hover:text-foreground transition-colors"
									>
										{link.label}
									</Link>
								</li>
							))}
						</ul>
					</div>
				</div>

				{/* Bottom bar */}
				<div className="mt-10 flex flex-col items-start justify-between gap-3 border-t pt-6 md:flex-row md:items-center">
					<span className="text-sm text-muted-foreground">
						&copy; {new Date().getFullYear()} TiêIA
					</span>
					<span className="text-xs text-muted-foreground/60">
						Forked from{" "}
						<Link
							href={UPSTREAM_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-muted-foreground transition-colors"
						>
							OpenCut
						</Link>
						{" "}&middot; Open source under MIT
					</span>
				</div>
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
