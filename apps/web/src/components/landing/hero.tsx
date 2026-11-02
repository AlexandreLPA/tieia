"use client";

import Link from "next/link";
import { SOCIAL_LINKS } from "@/constants/site-constants";
import { useLandingCopy } from "./language-provider";
import { TieLine } from "./tie-line";

export function Hero() {
	const { hero } = useLandingCopy();

	return (
		<section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 pt-16 pb-24 md:pt-24 lg:grid-cols-12 lg:gap-8 lg:pb-32">
			<div className="lg:col-span-7">
				<h1 className="font-display text-[clamp(2.5rem,5.2vw,4rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-balance">
					{hero.title}
				</h1>
				<p className="text-muted-foreground mt-6 max-w-[34rem] text-lg leading-relaxed text-pretty">
					{hero.lead}
				</p>
				<div className="mt-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">
					<Link
						href="/projects"
						className="bg-tie hover:bg-tie/90 focus-visible:ring-tie inline-flex h-12 items-center rounded-sm px-6 text-[1rem] font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
					>
						{hero.openProjects}
					</Link>
					<Link
						href={SOCIAL_LINKS.github}
						target="_blank"
						rel="noopener noreferrer"
						className="focus-visible:ring-tie rounded-sm text-[1rem] font-medium underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
					>
						{hero.viewCode}
					</Link>
				</div>
				<p className="text-muted-foreground mt-8 text-sm">{hero.license}</p>
			</div>
			<div className="mx-auto w-full max-w-[16rem] sm:max-w-xs lg:col-span-5 lg:max-w-none lg:pl-8">
				<TieLine />
			</div>
		</section>
	);
}
