/**
 * Accounts port guard (fork layer, 2026-11-21): every page lives under the
 * (app) group, which mounts AppShell + the providers, or the (auth) group.
 * Upstream's root layout wraps every page in AppShell; the fork moved that
 * into app/(app)/layout.tsx, so a page upstream adds at the top level
 * renders without it — v0.7.0's plugin page crashed ("Interaction layers
 * require InteractionLayersProvider in AppShell") until it moved.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";

function pages(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return entry.name === "api" && dir === "app" ? [] : pages(full);
		return /^page\.(tsx|ts|jsx|js)$/.test(entry.name) ? [full] : [];
	});
}

describe("route groups (accounts port)", () => {
	it("every page is under app/(app)/ or app/(auth)/", () => {
		const all = pages("app");
		assert.ok(all.some((p) => p.includes(`${path.sep}plugins${path.sep}`)), "the plugin page is found");
		const outside = all.filter((p) => !p.startsWith(path.join("app", "(app)") + path.sep) && !p.startsWith(path.join("app", "(auth)") + path.sep));
		assert.deepEqual(outside, [], "move these into app/(app)/ (or app/(auth)/ for sign-in pages)");
	});
});
