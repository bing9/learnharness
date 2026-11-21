import { pluginTransport, withOwnerAccount } from "@/src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Accounts (fork, 2026-11-21): plugins are the owner account's (src/server/auth/owner-scope.ts).
export const PUT = withOwnerAccount(async (request: Request, context: { params: Promise<{ id: string }> }) => {
	return pluginTransport.setEnabled((await context.params).id, request);
});
