import { authorizeCronRequest } from "../cron-auth";
import { NewsletterDeliveryConfigurationError } from "@atlasnews/core/newsletter/domain/newsletter";
import { getNewsletterDeliveryService } from "@atlasnews/adapters/newsletter/container";

async function run(request: Request) {
  const authorization = authorizeCronRequest(request);
  if (!authorization.ok) {
    return Response.json(
      { error: authorization.status === 503 ? "not_configured" : "unauthorized" },
      { status: authorization.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await getNewsletterDeliveryService().processOutboxBatch();
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
