"use client";

import Image from "next/image";
import { useLandingCopy } from "./language-provider";

export function NameStory() {
	const { nameStory } = useLandingCopy();

	return (
		<section className="border-t">
			<div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-28 sm:flex-row sm:items-start sm:gap-10 md:py-32">
				<Image
					src="/icons/icon-192x192.png"
					alt={nameStory.iconAlt}
					width={88}
					height={88}
					className="shrink-0"
				/>
				<div className="max-w-[38rem]">
					<h2 className="font-display text-3xl leading-tight font-semibold tracking-[-0.015em] md:text-[2.5rem]">
						{nameStory.title}
					</h2>
					<p className="mt-6 text-lg leading-relaxed text-pretty">
						{nameStory.beforeSpecies}
						<i lang="la">Ramphocelus bresilius</i>
						{nameStory.afterSpecies}
					</p>
				</div>
			</div>
		</section>
	);
}
