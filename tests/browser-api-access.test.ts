/**
 * Browser-only mode (`npm run dev` / `npm start`) has no desktop secret, so
 * the API is guarded by where it listens, a Host check against DNS rebinding,
 * and a cross-site check on writes. None of this is user authentication.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { readFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { browserAPIRefusal, browserHostAllowed, browserOnlyMode } from "../src/server/desktop-access.ts";

// ── the seam, BEFORE any config-loading import ──────────────────────────────
// The proxy reads the account registry (config.USERS_FILE) at import time, so
// the data root must be isolated here: the repo's own data/ is shared with
// other test files (desktop-api.test.ts writes users.json into it), and the
// gate's answer for anonymous requests — 401 initialized vs 503 first-run —
// depends on whether an account exists.
const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-browser-api-access-"));
process.env.LH_DATA_DIR = TMP_DATA;

const { proxy } = await import("../proxy.ts");
const { SESSION_COOKIE, signSession } = await import("../src/server/auth/session.ts");
const { createAccount } = await import("../src/store/users.ts");

after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

// One account, so the gate is initialized; one signed session, so the tests
// can exercise the refusal policy that runs after the session check.
const account = createAccount({ name: "Gate", email: "gate@example.com", passwordHash: "scrypt$fixture", role: "admin" });
const sessionCookie = `${SESSION_COOKIE}=${await signSession({ sub: account.id, email: account.email, role: account.role, ver: account.sessionVersion })}`;

const secret = "a".repeat(64);

function withEnv<T>(values: Record<string, string | undefined>, run: () => T | Promise<T>): T | Promise<T> {
	const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
	for (const [key, value] of Object.entries(values)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	const restore = () => {
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	};
	const result = run();
	// The fork's proxy is async (PR #378 auth gate); env must stay set until
	// the returned promise settles, not just until run() returns.
	if (result instanceof Promise) return result.finally(restore) as T;
	restore();
	return result;
}

const browserEnv = { LH_DESKTOP_SERVER: undefined, LH_DESKTOP_API_SECRET: undefined, LH_ALLOWED_HOSTS: undefined };

function request(url: string, init: { method?: string; headers?: Record<string, string> } = {}) {
	return new Request(url, init);
}

describe("browser-only Host check", () => {
	it("accepts localhost names and IP literals on any port", () => {
		for (const host of ["localhost:3000", "LOCALHOST", "app.localhost:3000", "127.0.0.1:3000", "[::1]:3000", "192.168.1.20:3000", "10.0.0.5"]) {
			assert.equal(browserHostAllowed(host, {}), true, host);
		}
	});

	it("rejects other names, the shape a DNS-rebinding page arrives with", () => {
		for (const host of ["rebind.attacker.example:3000", "mymac.local:3000", "localhost.attacker.example", "127.0.0.1.nip.io:3000", "", null]) {
			assert.equal(browserHostAllowed(host, {}), false, String(host));
		}
	});

	it("LH_ALLOWED_HOSTS adds exact names, case-insensitive, port ignored, no wildcards", () => {
		const env = { LH_ALLOWED_HOSTS: " mymac.local, Proxy.Example.com ," };
		assert.equal(browserHostAllowed("mymac.local:3000", env), true);
		assert.equal(browserHostAllowed("proxy.example.com", env), true);
		assert.equal(browserHostAllowed("sub.proxy.example.com", env), false);
		assert.equal(browserHostAllowed("other.example.com", env), false);
	});
});

describe("browser-only cross-site check", () => {
	const api = "http://localhost:3000/api/chats";

	it("refuses every request with a disallowed Host, reads included", () => {
		const refusal = browserAPIRefusal(request("http://rebind.attacker.example:3000/api/settings"), {});
		assert.match(refusal ?? "", /LH_ALLOWED_HOSTS/);
	});

	it("leaves reads alone, since a cross-site page cannot read the response", () => {
		for (const method of ["GET", "HEAD", "OPTIONS"]) {
			assert.equal(browserAPIRefusal(request(api, { method, headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } }), {}), undefined, method);
		}
	});

	it("refuses writes another site or an opaque origin sends", () => {
		for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
			for (const headers of [
				{ origin: "https://evil.example", "sec-fetch-site": "cross-site" },
				{ "sec-fetch-site": "cross-site" },
				{ "sec-fetch-site": "same-site" },
				{ origin: "https://evil.example" },
				{ origin: "null" },
				{ origin: "http://localhost:3001" },
			] as Record<string, string>[]) {
				assert.match(browserAPIRefusal(request(api, { method, headers }), {}) ?? "", /Cross-site/, `${method} ${JSON.stringify(headers)}`);
			}
		}
	});

	it("allows same-origin browser writes and header-less clients such as curl", () => {
		assert.equal(browserAPIRefusal(request(api, { method: "POST", headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" } }), {}), undefined);
		assert.equal(browserAPIRefusal(request(api, { method: "POST", headers: { origin: "http://localhost:3000" } }), {}), undefined);
		assert.equal(browserAPIRefusal(request(api, { method: "POST" }), {}), undefined);
	});
});

describe("proxy", () => {
	it("applies the browser checks only when there is no desktop secret", () => {
		assert.equal(browserOnlyMode({}), true);
		assert.equal(browserOnlyMode({ LH_DESKTOP_SERVER: "1" }), false);
		assert.equal(browserOnlyMode({ LH_DESKTOP_API_SECRET: secret }), false);
	});

	it("anonymous API requests get the auth gate, never the refusal policy", async () => {
		// Composed policy (fork + upstream v0.6.1): check order is setup
		// redirect, then session, then refusal. Anonymous requests stop at
		// the gate with 401 whatever their Host or Origin — the refusal
		// policy only runs for signed-in requests (next test). Upstream
		// answered these with 403 from the refusal policy; the fork's gate
		// is stricter and runs first.
		await withEnv(browserEnv, async () => {
			const csrf = await proxy(new NextRequest("http://localhost:3000/api/chats", { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site", "content-type": "text/plain" } }));
			assert.equal(csrf.status, 401);
			assert.equal((await proxy(new NextRequest("http://rebind.attacker.example:3000/api/settings"))).status, 401);
			const ok = await proxy(new NextRequest("http://localhost:3000/api/chats", { method: "POST", headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" } }));
			assert.equal(ok.status, 401);
		});
	});

	it("signed-in requests get the browser refusal policy after the session check", async () => {
		await withEnv(browserEnv, async () => {
			const csrf = await proxy(new NextRequest("http://localhost:3000/api/chats", { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site", "content-type": "text/plain", cookie: sessionCookie } }));
			assert.equal(csrf.status, 403);
			assert.equal((await proxy(new NextRequest("http://rebind.attacker.example:3000/api/settings", { headers: { cookie: sessionCookie } }))).status, 403);
			const ok = await proxy(new NextRequest("http://localhost:3000/api/chats", { method: "POST", headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin", cookie: sessionCookie } }));
			assert.equal(ok.headers.get("x-middleware-next"), "1");
		});
	});

	it("keeps the desktop path unchanged: the secret decides, not Host or Origin", async () => {
		await withEnv({ LH_DESKTOP_SERVER: "1", LH_DESKTOP_API_SECRET: secret, LH_ALLOWED_HOSTS: undefined }, async () => {
			const viaGateway = await proxy(new NextRequest("http://mymac.local:4747/api/chats", { method: "POST", headers: { "x-learnharness-desktop": secret } }));
			assert.equal(viaGateway.headers.get("x-middleware-next"), "1");
			// No secret and no session: the auth gate answers 401 before the
			// refusal policy is consulted (composed check order). Upstream
			// answered 403 from its desktop-secret refusal.
			assert.equal((await proxy(new NextRequest("http://127.0.0.1:3000/api/chats", { method: "POST" }))).status, 401);
		});
	});
});

describe("package scripts", () => {
	it("serve on loopback unless the developer passes a later -H", () => {
		const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { scripts: { dev: string; start: string; "desktop:dev": string } };
		assert.match(scripts.dev, /^npm run plugins:build-core && npm run plugins:build-authoring && next dev -H localhost\b/);
		assert.match(scripts.start, /^next start -H localhost\b/);
		assert.match(scripts["desktop:dev"], /"npm run dev"/);
	});
});
