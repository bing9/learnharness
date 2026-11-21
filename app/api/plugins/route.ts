import { pluginTransport, withOwnerAccount } from "@/src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Accounts (fork, 2026-11-21): plugins are the owner account's; others see none.
const NO_PLUGINS = () => Response.json({ plugins: [], directory: "", conflicts: [] }, { headers: { "Cache-Control": "no-store" } });
export const GET = withOwnerAccount(() => pluginTransport.list(), NO_PLUGINS);
export const POST = withOwnerAccount((request: Request) => pluginTransport.refresh(request));
