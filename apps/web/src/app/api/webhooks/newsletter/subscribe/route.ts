import { NewsletterDeliveryConfigurationError } from "@atlasnews/core/newsletter/domain/newsletter";
import { getNewsletterDeliveryService } from "@/server/composition";
import { handleNewsletterSubscriptionRequest } from "@/server/newsletter/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    return await handleNewsletterSubscriptionRequest({
      request,
      service: getNewsletterDeliveryService(),
    });
  } catch (error) {
    const status = error instanceof NewsletterDeliveryConfigurationError ? 503 : 500;
    return Response.json(
      { error: status === 503 ? "not_configured" : "subscription_failed" },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
