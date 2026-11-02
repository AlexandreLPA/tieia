"use client";

import { useLandingCopy } from "./language-provider";

export function Features() {
	const { features } = useLandingCopy();

	return (
		<section className="border-t">
			<div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 py-24 lg:grid-cols-12 lg:gap-8">
				<div className="lg:col-span-5">
					<h2 className="font-display text-3xl leading-tight font-semibold tracking-[-0.015em] text-balance md:text-[2.5rem]">
						{features.title}
					</h2>
					<p className="text-muted-foreground mt-6 max-w-[30rem] text-lg leading-relaxed text-pretty">
						{features.lead}
					</p>
				</div>
				<div className="lg:col-span-7">
					<h3 className="text-muted-foreground text-sm font-medium">
						{features.alsoHeading}
					</h3>
					<dl className="mt-4 grid gap-x-10 sm:grid-cols-2">
						{features.items.map((feature) => (
							<div key={feature.title} className="border-t py-5">
								<dt className="text-[1rem] font-semibold">{feature.title}</dt>
								<dd className="text-muted-foreground mt-1.5 text-[0.9375rem] leading-relaxed text-pretty">
									{feature.text}
								</dd>
							</div>
						))}
					</dl>
					<p className="text-muted-foreground mt-6 text-[0.9375rem] leading-relaxed text-pretty">
						{features.inDevelopment}
					</p>
				</div>
			</div>
		</section>
	);
}
