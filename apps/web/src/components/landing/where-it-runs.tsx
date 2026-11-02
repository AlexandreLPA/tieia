"use client";

import Link from "next/link";
import { SOCIAL_LINKS } from "@/constants/site-constants";
import { useLandingCopy } from "./language-provider";

export function WhereItRuns() {
	const { whereItRuns } = useLandingCopy();

	return (
		<section className="bg-surface border-t">
			<div className="mx-auto max-w-6xl px-6 py-24">
				<h2 className="font-display max-w-[40rem] text-3xl leading-tight font-semibold tracking-[-0.015em] text-balance md:text-[2.5rem]">
					{whereItRuns.title}
				</h2>
				<div className="mt-12 grid gap-12 md:grid-cols-2 md:gap-10">
					<div>
						<h3 className="text-xl font-semibold">
							{whereItRuns.localHeading}
						</h3>
						<ul className="mt-4">
							{whereItRuns.local.map((item) => (
								<li
									key={item}
									className="border-t py-3 text-[1rem] leading-relaxed text-pretty"
								>
									{item}
								</li>
							))}
						</ul>
					</div>
					<div>
						<h3 className="text-xl font-semibold">
							{whereItRuns.cloudHeading}
						</h3>
						<ul className="mt-4">
							{whereItRuns.cloud.map((item) => (
								<li key={item.what} className="border-t py-3">
									<p className="text-[1rem] leading-relaxed text-pretty">
										{item.what}
									</p>
									<p className="text-muted-foreground mt-1 text-[0.9375rem] leading-relaxed text-pretty">
										{item.note}
									</p>
								</li>
							))}
						</ul>
					</div>
				</div>
				<p className="text-muted-foreground mt-10 max-w-[40rem] text-[0.9375rem] leading-relaxed text-pretty">
					{whereItRuns.footnote}{" "}
					<Link
						href={`${SOCIAL_LINKS.github}#privacy`}
						target="_blank"
						rel="noopener noreferrer"
						className="text-foreground underline decoration-1 underline-offset-4 hover:decoration-2"
					>
						README
					</Link>
					.
				</p>
			</div>
		</section>
	);
}
