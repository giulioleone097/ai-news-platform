import { authorizeCronRequest } from "@/lib/cron-auth";
import { createSocialPublishingRuntime } from "@/modules/social-publishing/infrastructure/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function processSocialOutbox(request: Request) {
  const authorization = authorizeCronRequest(request);
  if (!authorization.ok) return Response.json(
    { error: authorization.status === 503 ? "cron_not_configured" : "unauthorized" },
    {
      status: authorization.status,
      headers: { "Cache-Control": "no-store" },
    },
  );

  try {
    const result = await createSocialPublishingRuntime().processor.processBatch();
    return Response.json(result, {
      status: result.unresolved > 0 ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "social_outbox_unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export const GET = processSocialOutbox;
export const POST = processSocialOutbox;
