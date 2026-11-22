/**
 * One data-scope tracker per process (2026-11-22). Next loads src/core/scope.ts
 * once per compiled entry; a request that sets the account in one copy must be
 * visible to code that reads it through another copy (the plugin runtime is
 * built once and shared through globalThis). Two imports with different query
 * strings are two module instances, as in the server build.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";

const file = pathToFileURL(path.join(import.meta.dirname, "..", "src", "core", "scope.ts")).href;
const a = (await import(`${file}?copy=a`)) as typeof import("../src/core/scope.ts");
const b = (await import(`${file}?copy=b`)) as typeof import("../src/core/scope.ts");

describe("the data scope is one per process", () => {
	it("loads as two module instances here (the setup this test relies on)", () => {
		assert.notEqual(a.runInScope, b.runInScope);
	});
	it("a scope set through one copy is the current scope in the other", async () => {
		const scope = { userId: "usr_test", email: "t@example.com", role: "admin" as const, dataRoot: "/tmp/lh-scope-test/usr_test" };
		assert.equal(b.currentScope(), undefined);
		await a.runInScope(scope, async () => {
			await Promise.resolve();
			assert.deepEqual(b.currentScope(), scope);
			assert.equal(b.scopedDataRoot("/base"), scope.dataRoot);
		});
		assert.equal(b.currentScope(), undefined);
	});
});
