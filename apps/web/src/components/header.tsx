"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Button } from "./ui/button";
import { ThemeToggle } from "./theme-toggle";
import {
	GithubIcon,
	Menu02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/utils/ui";
import { SOCIAL_LINKS } from "@/constants/site-constants";
import { TieiaLogo } from "./footer";
import { useLandingCopy } from "./landing/language-provider";
import { LanguageSwitcher } from "./landing/language-switcher";

export function Header() {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const closeMenu = () => setIsMenuOpen(false);
	const { nav } = useLandingCopy();


	return (
		<header className="bg-background sticky top-0 z-10 border-b">
			<div className="relative flex w-full items-center justify-between px-6 py-3">
				<div className="relative z-10 flex items-center gap-6">
					<Link href="/" className="flex items-center gap-3">
						<TieiaLogo size={36} />
						<span className="text-base font-bold tracking-tight hidden sm:inline">
							TiêIA
						</span>
					</Link>
				</div>

				<div className="relative z-10 flex items-center gap-3">
					<LanguageSwitcher />
					<div className="flex items-center gap-3 md:hidden">
						<Button
							variant="text"
							size="icon"
							className="flex items-center justify-center p-0"
							aria-label={isMenuOpen ? nav.closeMenu : nav.openMenu}
							onClick={() => setIsMenuOpen(!isMenuOpen)}
						>
							<HugeiconsIcon icon={Menu02Icon} size={30} />
						</Button>
					</div>
					<div className="hidden items-center gap-3 md:flex">
						<Link
							href={SOCIAL_LINKS.github}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex h-9 items-center gap-2 rounded-sm px-2 text-sm hover:opacity-75 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
						>
							<HugeiconsIcon icon={GithubIcon} className="size-4" />
							GitHub
						</Link>
						<Link
							href="/projects"
							className="bg-primary text-primary-foreground inline-flex h-9 items-center rounded-sm px-4 text-sm font-medium hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden"
						>
							{nav.openEditor}
						</Link>
						<ThemeToggle />
					</div>
				</div>
				<div
					className={cn(
						"bg-background pointer-events-none fixed inset-0 opacity-0",
						"transition-opacity duration-150",
						isMenuOpen && "pointer-events-auto opacity-100",
					)}
				>
					<div className="relative h-full">
						<button
							type="button"
							aria-label={nav.closeMenu}
							className="absolute inset-0"
							onClick={closeMenu}
							onKeyDown={(event) => {
								if (
									event.key === "Enter" ||
									event.key === " " ||
									event.key === "Escape"
								) {
									event.preventDefault();
									closeMenu();
								}
							}}
						/>
						<nav className="flex flex-col gap-3 px-6 pt-[5rem]">
							{[
								{ label: nav.openEditor, href: "/projects" },
								{ label: "GitHub", href: SOCIAL_LINKS.github },
							].map((link, index) => (
								<motion.div
									key={link.href}
									initial={{ scale: 0.98, opacity: 0 }}
									animate={{
										scale: isMenuOpen ? 1 : 0.98,
										opacity: isMenuOpen ? 1 : 0,
									}}
									transition={{
										duration: 0.4,
										delay: isMenuOpen ? index * 0.1 : 0,
										ease: [0.25, 0.46, 0.45, 0.94],
									}}
								>
									<Link
										href={link.href}
										className="text-2xl font-semibold"
										onClick={() => setIsMenuOpen(false)}
									>
										{link.label}
									</Link>
								</motion.div>
							))}
						</nav>
						<ThemeToggle
							className="absolute right-8 bottom-8 size-10"
							iconClassName="!size-[1.2rem]"
							onToggle={(e) => {
								e.preventDefault();
								e.stopPropagation();
							}}
						/>
					</div>
				</div>
			</div>
		</header>
	);
}
