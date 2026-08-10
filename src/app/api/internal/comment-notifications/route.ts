import { authorizeCronRequest } from "@/lib/cron-auth";
import { createCommentNotificationDeliveryService } from "@/modules/comments/infrastructure/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(request: Request) {
  const authorization = authorizeCronRequest(request);
  if (!authorization.ok) {
    return Response.json(
      { error: authorization.status === 503 ? "cron_not_configured" : "unauthorized" },
      { status: authorization.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const service = createCommentNotificationDeliveryService();
  if (!service) {
    return Response.json({ error: "comment_notifications_unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    return Response.json(await service.processBatch(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "comment_notification_worker_failed" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export const GET = run;
export const POST = run;
