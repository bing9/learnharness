import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Source_Sans_3 } from "next/font/google";
import { connection } from "next/server";
import "katex/dist/katex.min.css";
import "./globals.css";
import { readThemeBoot } from "@/src/server";

// Chrome = JetBrains Mono, teaching prose = Source Sans 3, titles = CMU
// Serif (the bundled lh-cmu @font-face in globals.css — no CDN).
const ui = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
const prose = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans3" });

export const metadata: Metadata = {
	title: "Learning Harness",
	description: "A teacher agent with a memory — sessions, quizzes, and a knowledge graph of what you know.",
	applicationName: "Learning Harness",
	manifest: "/manifest.webmanifest",
	icons: {
		icon: "/icons/icon-192.png",
		apple: "/icons/apple-touch-icon.png",
	},
	appleWebApp: {
		capable: true,
		title: "Harness",
		statusBarStyle: "black-translucent",
	},
};

/**
 * Mobile web (mobile-web, 2026-10-29): `viewportFit: cover` lets the CSS read
 * the safe-area insets on notched phones; zoom is left enabled (accessibility)
 * and the app itself never relies on double-tap.
 */
export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	maximumScale: 5,
	viewportFit: "cover",
	// Phones: the on-screen keyboard shrinks the layout instead of covering the
	// composer, so the field and the sheet stay reachable while typing.
	interactiveWidget: "resizes-content",
	themeColor: "#0b0b0c",
	colorScheme: "dark",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
	// The theme is server-rendered — its class AND its color variables —
	// so no first frame ever shows the wrong theme. connection(): the
	// record and the theme files are per-machine disk state — without it a
	// prerendered route (settings) would bake the BUILD machine's record.
	// Providers live in the (app)/(auth) route-group layouts, not here:
	// the root stays bare so auth pages never mount the app shell.
	await connection();
	const { theme, vars } = readThemeBoot();
	return (
		<html
			lang="en"
			className={`${theme.mode} ${ui.variable} ${prose.variable}`}
			style={vars as React.CSSProperties}
			suppressHydrationWarning
		>
			<body className="min-h-dvh antialiased">{children}</body>
		</html>
	);
}
