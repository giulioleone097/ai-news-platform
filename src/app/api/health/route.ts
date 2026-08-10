import { getProductionReadiness } from "@/config/env";

export const dynamic = "force-dynamic";

export function GET() {
  const readiness = getProductionReadiness();
  return Response.json(
    {
      status: readiness.ready ? "ready" : "not-ready",
      contentMode: readiness.mode,
      canonicalOrigin: readiness.siteUrl.origin,
      capabilities: readiness.capabilities,
      checks: readiness.issues,
    },
    {
      status: readiness.ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
