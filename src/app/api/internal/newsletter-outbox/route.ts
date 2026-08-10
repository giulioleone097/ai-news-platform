import { authorizeCronRequest } from "@/lib/cron-auth";
import { NewsletterDeliveryConfigurationError } from "@/modules/newsletter-delivery/domain";
import { getNewsletterDeliveryService } from "@/modules/newsletter-delivery/container";
import { processNewsletterOutbox } from "@/modules/newsletter-delivery/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(request: Request) {
  const authorization = authorizeCronRequest(request);
  if (!authorization.ok) {
    return Response.json(
      { error: authorization.status === 503 ? "not_configured" : "unauthorized" },
      { status: authorization.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await processNewsletterOutbox(getNewsletterDeliveryService());
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof NewsletterDeliveryConfigurationError ? 503 : 500;
    return Response.json(
      { error: status === 503 ? "not_configured" : "delivery_failed" },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = run;
export const POST = run;
