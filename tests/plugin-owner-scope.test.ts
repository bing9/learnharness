/**
 * Plugins run as the owner account (fork layer, owner 2026-11-21,
 * src/server/auth/owner-scope.ts): upstream's plugin runtime is one per
 * process with one data folder, so its records live under the owner's
 * learning data, its startup work runs in the owner's scope, and other
 * accounts get no plugins. Plugin code and on/off state stay the machine's.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const base = fs.mkdtempSync(path.join(os.tmpdir(), "lh-plugin-owner-"));
process.env.LH_DATA_DIR = base;
const { BASE_DATA, PATHS, userDataRoot } = await import("../config.ts");
const { runInScope } = await import("../src/core/scope.ts");
const { asOwnerAccount, isOwnerScope, withOwnerAccount } = await import("../src/server/auth/owner-scope.ts");
const { createAccount } = await import("../src/store/users.ts");
const { migrateLegacyData } = await import("../src/server/auth/accounts.ts");
after(() => fs.rmSync(base, { recursive: true, force: true }));

describe("plugins run as the owner account", () => {
	it("before any account exists, everything runs as is", () => {
		assert.equal(asOwnerAccount(() => PATHS.data), BASE_DATA);
		assert.equal(isOwnerScope(), true);
	});

	it("the first-account move carries plugin records into the account", () => {
		fs.mkdirSync(path.join(BASE_DATA, "core-plugin-data", "flashcards"), { recursive: true });
		fs.writeFileSync(path.join(BASE_DATA, "core-plugin-data", "flashcards", "deck.json"), '{"cards":1}');
		migrateLegacyData("usr_first");
		assert.equal(fs.readFileSync(path.join(userDataRoot("usr_first"), "core-plugin-data", "flashcards", "deck.json"), "utf-8"), '{"cards":1}');
		assert.ok(!fs.existsSync(path.join(BASE_DATA, "core-plugin-data")), "left behind in the base folder");
	});

	it("with accounts: owner scope = the owner's learning data; only the owner counts as owner", () => {
		const owner = createAccount({ name: "Bing", email: "bing@example.com", passwordHash: "x", role: "admin" });
		const other = createAccount({ name: "Guest", email: "guest@example.com", passwordHash: "x", role: "user" });
		assert.equal(asOwnerAccount(() => PATHS.data), userDataRoot(owner.id));
		const scope = (u: typeof owner) => ({ userId: u.id, email: u.email, role: u.role, dataRoot: userDataRoot(u.id) });
		assert.equal(runInScope(scope(owner), isOwnerScope), true);
		assert.equal(runInScope(scope(other), isOwnerScope), false);
		assert.equal(isOwnerScope(), false, "no scope at all is not the owner once accounts exist");
	});

	it("routes: other accounts get the fallback (403 by default), never the handler", async () => {
		// The test runner's request scope is the legacy local one — not the owner.
		let ran = false;
		const denied = await withOwnerAccount((_request: Request) => ((ran = true), new Response("ok")))(new Request("http://x/api/plugins/x/call", { method: "POST" }));
		assert.equal(denied.status, 403);
		assert.equal((await denied.json()).error, "owner_only");
		const listed = await withOwnerAccount(() => new Response("catalog"), () => Response.json({ plugins: [] }))();
		assert.deepEqual(await listed.json(), { plugins: [] });
		assert.equal(ran, false);
	});

	it("the plugin runtime keeps records under the owner's learning data, code/state on the machine", async () => {
		fs.writeFileSync(path.join(BASE_DATA, "plugins-state.json"), JSON.stringify({ version: 1, enabled: { flashcards: true } }));
		const { initializePlugins, pluginDirectory, getPluginAgentContributions } = await import("../src/server/plugins.ts");
		assert.equal(pluginDirectory, path.join(BASE_DATA, "plugins"), "plugin code: machine-wide");
		await initializePlugins();
		const ownerId = (await import("../src/store/users.ts")).ownerAccount()!.id;
		assert.ok(fs.existsSync(path.join(userDataRoot(ownerId), "core-plugin-data", "flashcards")), "records under the owner's learning data");
		assert.ok(!fs.existsSync(path.join(BASE_DATA, "core-plugin-data", "flashcards")), "nothing in the base folder");
		// A non-owner turn gets no plugin tools or instructions.
		const contributions = await getPluginAgentContributions();
		assert.deepEqual(contributions({ chatId: "c", agent: "teacher" }, []), { instructions: [], tools: [] });
	});
});
