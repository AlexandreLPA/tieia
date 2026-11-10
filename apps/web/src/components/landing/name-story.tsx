"use client";

import Image from "next/image";
import { useLandingCopy } from "./language-provider";

export function NameStory() {
	const { nameStory } = useLandingCopy();

	return (
		<section className="border-t">
			<div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-28 md:py-32 lg:grid-cols-12 lg:gap-8">
				<div className="lg:col-span-7">
					<h2 className="font-display text-3xl leading-tight font-semibold tracking-[-0.015em] md:text-[2.5rem]">
						{nameStory.title}
					</h2>
					<p className="mt-6 max-w-[38rem] text-lg leading-relaxed text-pretty">
						{nameStory.beforeSpecies}
						<i lang="la">Ramphocelus bresilius</i>
						{nameStory.afterSpecies}
					</p>
					<p className="mt-5 max-w-[38rem] text-lg leading-relaxed text-pretty">
						{nameStory.why}
					</p>
				</div>
				<div className="lg:col-span-5 lg:pt-2">
					<Image
						src="/brand/icon-bold.png"
						alt={nameStory.iconAlt}
						width={96}
						height={96}
						className="shrink-0"
					/>
					<h3 className="mt-6 text-xl font-semibold">{nameStory.iconTitle}</h3>
					{nameStory.icon.map((paragraph) => (
						<p
							key={paragraph}
							className="text-muted-foreground mt-3 text-[0.9375rem] leading-relaxed text-pretty"
						>
							{paragraph}
						</p>
					))}
				</div>
			</div>
		</section>
	);
}
