import { NextResponse } from "next/server";
import { imageGateway } from "@/lib/imagegen";
import { isAdmin } from "@/lib/imagegen/http-api";

/**
 * GET /api/admin/image-providers — provider health for operators.
 * Requires `Authorization: Bearer <IMAGE_ADMIN_TOKEN>`. Never returns
 * credentials. Health is per server instance.
 */
export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const g = imageGateway();
  const providers = g.registry.all().map((p) => ({
    ...g.health.snapshot(p.name),
    configured: p.isConfigured(),
    capabilities: p.capabilities,
  }));
  return NextResponse.json(
    { strategy: g.config.strategy, forceProvider: g.config.forceProvider ?? null, providers, instanceStartedAt: new Date(Date.now() - process.uptime() * 1000).toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
