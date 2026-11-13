import { connection } from "next/server";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { ActivityProvider } from "@/components/activity-dock";
import { ServerEventsProvider } from "@/components/server-events";
import { AppearanceProvider } from "@/components/settings/appearance";
import { PluginsProvider } from "@/components/plugins";
import UpdateBanner from "@/components/update-banner";
import { SessionGuard } from "@/components/auth/session-guard";
import { readThemeBoot } from "@/src/server";

/**
 * The signed-in application shell (mobile-web route group, 2026-10-29):
 * every page that needs the sidebar, the activity bus and the appearance
 * preferences lives under this layout. The auth pages (/login, /setup, /join)
 * sit in the (auth) group and never mount it.
 *
 * Upstream v0.6.x: AppearanceProvider takes server-read initialAppearance /
 * initialTheme (no wrong-theme first frame), and plugin UI needs
 * PluginsProvider — both read here, mirroring upstream's root layout.
 * connection(): the record and theme files are per-machine disk state.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
	await connection();
	const { appearance, theme } = readThemeBoot();
	return (
		<>
			{/* Web sessions: bounce to /login on an expired/revoked cookie. */}
			<SessionGuard />
			{/* The notification channel rides OUTSIDE everything: sidebar, dock,
				and pages all subscribe as the polls retire (push S3, 2026-10-02). */}
			<ServerEventsProvider>
				<PluginsProvider>
					<AppearanceProvider initialAppearance={appearance} initialTheme={theme}>
						<SidebarProvider>
							<ActivityProvider>
								<AppShell>{children}</AppShell>
							</ActivityProvider>
						</SidebarProvider>
					</AppearanceProvider>
				</PluginsProvider>
			</ServerEventsProvider>
			{/* Auto-update banner (Wave C): fixed card, Electron-only pushes. */}
			<UpdateBanner />
		</>
	);
}
