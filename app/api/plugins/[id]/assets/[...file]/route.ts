import { pluginTransport, withOwnerAccount } from "@/src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Accounts (fork, 2026-11-21): plugins are the owner account's (src/server/auth/owner-scope.ts).
export const GET = withOwnerAccount(async (_request: Request, context: { params: Promise<{ id: string; file: string[] }> }) => {
	const { id, file } = await context.params;
	return pluginTransport.asset(id, file);
});
