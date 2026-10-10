import { NewsletterDeliveryConfigurationError } from "@atlasnews/core/newsletter/domain/newsletter";
import { getNewsletterDeliveryService } from "@/server/composition";
import {
  handleNewsletterConfirmation,
  newsletterConfirmationPage,
} from "@/server/newsletter/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function localeFromRequest(request: Request) {
  return new URL(request.url).searchParams.get("locale") === "it" ? "it" as const : "en" as const;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  await context.params;
  return newsletterConfirmationPage(request, localeFromRequest(request));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  try {
    return await handleNewsletterConfirmation(
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
      { error: "confirmation_failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
