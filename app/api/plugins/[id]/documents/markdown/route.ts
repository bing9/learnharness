import { createPluginDocumentRoute, pluginTransport, withOwnerAccount } from "@/src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This exact route skips Proxy body cloning, NOT desktop authentication.
const handlers = createPluginDocumentRoute(pluginTransport);
// Accounts (fork, 2026-11-21): plugins are the owner account's (src/server/auth/owner-scope.ts).
export const POST = withOwnerAccount(handlers.POST);
export const OPTIONS = handlers.OPTIONS;
export const GET = handlers.GET;
export const HEAD = handlers.HEAD;
export const PUT = handlers.PUT;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
