"use client";

import Link from "next/link";
import { CopyCommand } from "./copy-command";
import { useLandingCopy } from "./language-provider";

// The step texts live in i18n.ts (cta.steps), in the same order.
const COMMANDS = [
	"git clone https://github.com/AlexandreLPA/tieia.git\ncd tieia\ncp .env.example .env\ncp apps/web/.env.example apps/web/.env.local",
	"docker compose build",
	"powershell -ExecutionPolicy Bypass -File scripts/start-opencut.ps1",
];

export function CTA() {
	const { cta, hero } = useLandingCopy();

	return (
		<section className="bg-surface border-t">
			<div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 py-24 lg:grid-cols-12 lg:gap-8">
				<div className="lg:col-span-4">
					<h2 className="font-display text-3xl leading-tight font-semibold tracking-[-0.015em] text-balance md:text-[2.5rem]">
						{cta.title}
					</h2>
					<p className="text-muted-foreground mt-6 text-[1rem] leading-relaxed text-pretty">
						{cta.requirements}
					</p>
					<p className="mt-4 text-[1rem] leading-relaxed text-pretty">
						{cta.cost}
					</p>
				</div>
				<ol className="flex flex-col gap-8 lg:col-span-8">
					{COMMANDS.map((command, index) => (
						<li key={command} className="flex gap-4">
							<span className="text-tie-ink font-display w-6 shrink-0 text-xl font-semibold tabular-nums">
								{index + 1}
							</span>
							<div className="min-w-0 flex-1">
								<p className="text-[1rem] leading-relaxed text-pretty">
									{cta.steps[index]}
								</p>
								<div className="mt-3">
									<CopyCommand command={command} />
								</div>
							</div>
						</li>
					))}
					<li className="flex gap-4">
						<span className="w-6 shrink-0" />
						<Link
							href="/projects"
							className="bg-tie hover:bg-tie/90 focus-visible:ring-tie inline-flex h-12 items-center rounded-sm px-6 text-[1rem] font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
						>
							{hero.openProjects}
						</Link>
					</li>
				</ol>
			</div>
		</section>
	);
}
