import { NewsletterDeliveryConfigurationError } from "@/modules/newsletter-delivery/domain";
import { getNewsletterDeliveryService } from "@/modules/newsletter-delivery/container";
import {
  handleNewsletterUnsubscribe,
  newsletterUnsubscribePage,
} from "@/modules/newsletter-delivery/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function localeFromRequest(request: Request) {
  return new URL(request.url).searchParams.get("locale") === "it" ? "it" as const : "en" as const;
}

export async function GET(request: Request) {
  return newsletterUnsubscribePage(request, localeFromRequest(request));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  try {
    return await handleNewsletterUnsubscribe(
      getNewsletterDeliveryService(),
      token,
      localeFromRequest(request),
    );
  } catch (error) {
    if (error instanceof NewsletterDeliveryConfigurationError) {
      return Response.json(
        { error: "not_configured" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      { error: "unsubscribe_failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
