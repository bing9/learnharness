/**
 * The owner account (fork layer, owner 2026-11-21): plugins run as it.
 *
 * Upstream's plugin runtime is one per process and reads one data folder,
 * so it can serve one account: the owner (users.ts ownerAccount — the admin,
 * else the first account). Its records live under the owner's learning data
 * (`<account>/core-plugin-data/<id>/`), its startup and background work run in
 * the owner's scope, and other accounts get no plugins (no catalog, no routes,
 * no plugin tools in their turns) — they would otherwise reach the owner's
 * plugin data. Before any account exists (first run, the test runner): as is.
 */
import { userDataRoot } from "../../../config.ts";
import { currentScope, runInScope } from "../../core/scope.ts";
import { ownerAccount } from "../../store/users.ts";
import { withUser } from "./context.ts";

/** Run `fn` in the owner account's scope (as is when there is no account). */
export function asOwnerAccount<T>(fn: () => T): T {
	const owner = ownerAccount();
	if (!owner) return fn();
	return runInScope({ userId: owner.id, email: owner.email, role: owner.role, dataRoot: userDataRoot(owner.id) }, fn);
}

/** Is the current scope the owner's? True while there is no account yet. */
export function isOwnerScope(): boolean {
	const owner = ownerAccount();
	if (!owner) return true;
	return currentScope()?.userId === owner.id;
}

const ownerOnly = () =>
	Response.json(
		{ error: "owner_only", message: "Plugins are available to the owner account only." },
		{ status: 403, headers: { "Cache-Control": "no-store" } },
	);

/** withUser + the owner check: other accounts get `others()` (default 403). */
export function withOwnerAccount<A extends unknown[]>(
	handler: (...args: A) => Response | Promise<Response>,
	others: () => Response = ownerOnly,
): (...args: A) => Promise<Response> {
	return withUser(async (...args: A) => (isOwnerScope() ? handler(...args) : others()));
}
