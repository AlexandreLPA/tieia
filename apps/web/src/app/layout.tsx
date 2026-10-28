import { ThemeProvider } from "next-themes";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "../components/ui/sonner";
import { TooltipProvider } from "../components/ui/tooltip";
import { baseMetaData } from "./metadata";
import { BotIdClient } from "botid/client";
import { webEnv } from "@opencut-ai/env/web";
import { Inter } from "next/font/google";
import { JsonLd } from "@/components/seo/json-ld";
import { GoogleAnalytics } from "@/components/seo/google-analytics";

const siteFont = Inter({ subsets: ["latin"] });

// The desktop launcher (scripts/start-opencut.ps1) runs dev mode for daily
// use: there it should look like the production app, without React Scan or
// the Next.js issue overlay (which mostly showed browser-extension noise).
// Errors still reach the browser console.
const isDailyDevMode =
	process.env.NODE_ENV === "development" &&
	process.env.OPENCUT_HIDE_DEV_INDICATORS === "1";

export const metadata = baseMetaData;

const protectedRoutes = [
	{
		path: "/none",
		method: "GET",
	},
];

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" translate="no" suppressHydrationWarning>
			<head>
				<BotIdClient protect={protectedRoutes} />
				<JsonLd />
				<GoogleAnalytics />
				{process.env.NODE_ENV === "development" &&
					!isDailyDevMode &&
					process.env.NEXT_PUBLIC_REACT_SCAN === "1" && (
					<Script
						src="//unpkg.com/react-scan/dist/auto.global.js"
						crossOrigin="anonymous"
						strategy="beforeInteractive"
					/>
				)}
				{isDailyDevMode && (
					<style>{"nextjs-portal{display:none!important}"}</style>
				)}
			</head>
			<body className={`${siteFont.className} font-sans antialiased`} suppressHydrationWarning>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					disableTransitionOnChange={true}
				>
					<TooltipProvider>
						<Toaster />
						{process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID && (
							<Script
								src="https://cdn.databuddy.cc/databuddy.js"
								strategy="afterInteractive"
								async
								data-client-id={process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID}
								data-disabled={webEnv.NODE_ENV === "development"}
								data-track-attributes={false}
								data-track-errors={true}
								data-track-outgoing-links={false}
								data-track-web-vitals={false}
								data-track-sessions={false}
							/>
						)}
						{children}
					</TooltipProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
