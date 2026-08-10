import { getNewsletterDeliveryEnvironment } from "@/config/env";
import { NewsletterDeliveryConfigurationError } from "@/modules/newsletter-delivery/domain";
import { getNewsletterDeliveryService } from "@/modules/newsletter-delivery/container";
import { handleNewsletterWebhookRequest } from "@/modules/newsletter-delivery/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const environment = getNewsletterDeliveryEnvironment();
  if (!environment) {
    return Response.json(
      { error: "not_configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    return await handleNewsletterWebhookRequest({
      request,
      secret: environment.webhookSecret,
      service: getNewsletterDeliveryService(),
    });
  } catch (error) {
    const status = error instanceof NewsletterDeliveryConfigurationError ? 503 : 500;
    return Response.json(
      { error: status === 503 ? "not_configured" : "webhook_failed" },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
