import {
  handleWhatsAppWebhook,
  handleWhatsAppWebhookVerification,
} from "@/modules/social-publishing/http/whatsapp-webhook";
import { createWhatsAppWebhookRuntime } from "@/modules/social-publishing/infrastructure/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

function unavailable() {
  return Response.json({ error: "webhook_not_configured" }, {
    status: 503,
    headers: { "Cache-Control": "no-store" },
  });
}

export function GET(request: Request) {
  try {
    const { config } = createWhatsAppWebhookRuntime();
    return handleWhatsAppWebhookVerification(request, config);
  } catch {
    return unavailable();
  }
}

export async function POST(request: Request) {
  try {
    const { repository, config } = createWhatsAppWebhookRuntime();
    return await handleWhatsAppWebhook(request, repository, config);
  } catch {
    return unavailable();
  }
}
