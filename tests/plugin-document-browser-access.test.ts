import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, it } from "node:test";
import { NextRequest } from "next/server";

// ── the seam, BEFORE any config-loading import ──────────────────────────────
// The proxy reads the account registry (config.USERS_FILE) at import time.
// Isolate the data root and create one account so the gate is initialized:
// the proxy control below then has a stable answer (401) instead of
// depending on the repo's own data/ dir, which other test files write
// users.json into.
const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-plugin-document-browser-access-"));
process.env.LH_DATA_DIR = TMP_DATA;

const { proxy } = await import("../proxy.ts");
const { createPluginDocumentRoute } = await import("../src/server/plugin-transport.ts");
const { createAccount } = await import("../src/store/users.ts");

after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

createAccount({ name: "Gate", email: "gate@example.com", passwordHash: "scrypt$fixture", role: "admin" });

it("streamed document route shares browser policy before params, plugin work or multipart body access", async t => {
	const keys = ["LH_DESKTOP_SERVER", "LH_DESKTOP_API_SECRET", "LH_ALLOWED_HOSTS"] as const;
	const saved = keys.map(key => process.env[key]);
	for (const key of keys) delete process.env[key];
	try {
		const convert = t.mock.fn(async () => Response.json({ markdown: "owned fixture" }));
		const route = createPluginDocumentRoute({ convertDocument: convert });
		const methods = ["POST", "GET", "HEAD", "OPTIONS", "PUT", "PATCH", "DELETE"] as const;
		for (const method of methods) {
			const cases: { host: string; origin: string | undefined; site: string | undefined }[] = [{ host: "rebind.invalid", origin: undefined, site: undefined }];
			if (!["GET", "HEAD", "OPTIONS"].includes(method)) cases.push(
				{ host: "localhost", origin: "https://other.invalid", site: "cross-site" },
				{ host: "localhost", origin: "null", site: "cross-site" },
			);
			for (const { host, origin, site } of cases) {
				const headers: Record<string, string> = { host, "content-type": "multipart/form-data; boundary=owned" };
				if (origin) headers.origin = origin;
				if (site) headers["sec-fetch-site"] = site;
				const url = `http://${host}/api/plugins/document-one/documents/markdown`;
				const request = new Request(url, { method, headers });
				let bodyAccesses = 0, paramsAccesses = 0;
				Object.defineProperty(request, "body", { get() { bodyAccesses++; throw new Error("body accessed before policy"); } });
				const context = { get params(): Promise<{ id: string }> { paramsAccesses++; throw new Error("params accessed before policy"); } };
				const response = method === "POST" ? await route.POST(request, context) : await route[method](request);
				const control = await proxy(new NextRequest(url, { method, headers }));
				assert.equal(response.status, 403, `${method}: ${host} ${origin}`);
				assert.equal(response.headers.get("cache-control"), "no-store");
				assert.match((await response.json() as { error: string }).error, /not allowed|Cross-site/, `${method}: ${host} ${origin}`);
				// The route and the proxy refuse with different layers: the
				// route enforces the browser policy before touching the body
				// (403), while the proxy's auth gate answers first for an
				// unauthenticated request (401) and never reaches its refusal
				// policy (composed check order: setup, then session, then
				// refusal). Upstream compared them equal because its proxy
				// WAS the refusal policy. Both refuse; the codes differ.
				assert.equal(control.status, 401, `${method}: auth gate answers first`);
				assert.deepEqual(await control.json(), { error: "unauthorized", message: "Sign in to continue." });
				assert.equal(bodyAccesses, 0);
				assert.equal(paramsAccesses, 0);
				assert.equal(request.bodyUsed, false);
			}
		}
		assert.equal(convert.mock.callCount(), 0);
		const form = new FormData(); form.append("file", new File(["owned fixture"], "small.txt"));
		const post = new Request("http://localhost/api/plugins/document-one/documents/markdown", {
			method: "POST", headers: { origin: "http://localhost", "sec-fetch-site": "same-origin" }, body: form,
		});
		assert.equal((await route.POST(post, { params: Promise.resolve({ id: "document-one" }) })).status, 200);
		assert.equal(convert.mock.callCount(), 1);
		assert.equal(post.bodyUsed, false, "authorized route forwards the original stream");
	} finally {
		keys.forEach((key, index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index]; });
	}
});
