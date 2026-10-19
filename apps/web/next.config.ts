import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";
import { withContentCollections } from "@content-collections/next";

const nextConfig: NextConfig = {
	turbopack: {
		rules: {
			"*.glsl": {
				loaders: [require.resolve("raw-loader")],
				as: "*.js",
			},
		},
	},
	compiler: {
		removeConsole: process.env.NODE_ENV === "production",
	},
	reactStrictMode: true,
	// `start-opencut.ps1 -Dev` runs dev mode for the user to look at; there the
	// Next.js issue badge only showed noise such as browser extensions editing
	// the page before hydration
	...(process.env.OPENCUT_HIDE_DEV_INDICATORS === "1" && {
		devIndicators: false,
	}),
	productionBrowserSourceMaps: true,
	// The Docker image needs a standalone server; the desktop launcher builds
	// on Windows and serves with `next start`
	...(process.env.OPENCUT_LOCAL_BUILD !== "1" && { output: "standalone" }),
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "plus.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.marblecms.com",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "api.iconify.design",
			},
			{
				protocol: "https",
				hostname: "api.simplesvg.com",
			},
			{
				protocol: "https",
				hostname: "api.unisvg.com",
			},
		],
	},
};

export default withContentCollections(withBotId(nextConfig));
