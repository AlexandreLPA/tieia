import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { WhereItRuns } from "@/components/landing/where-it-runs";
import { NameStory } from "@/components/landing/name-story";
import { CTA } from "@/components/landing/cta";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { LandingLanguageProvider } from "@/components/landing/language-provider";
import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { SITE_URL } from "@/constants/site-constants";

const displayFont = Archivo({ subsets: ["latin"], variable: "--font-archivo" });

export const metadata: Metadata = {
	alternates: {
		canonical: SITE_URL,
	},
};

export default async function Home() {
	return (
		<LandingLanguageProvider
			className={`tieia-brand bg-background ${displayFont.variable}`}
		>
			<Header />
			<main>
				<Hero />
				<Features />
				<WhereItRuns />
				<NameStory />
				<CTA />
			</main>
			<Footer />
		</LandingLanguageProvider>
	);
}
