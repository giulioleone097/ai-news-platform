"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { StudioActionState } from "@/components/studio/action-state";
import { studioFieldErrors } from "@/components/studio/field-errors";
import { parseNewsletterCampaignRequest } from "@/components/studio/newsletter-campaigns/campaign-confirmation";
import { isLocale, type Locale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { parseUtcDateTimeInput } from "@/lib/editorial-datetime";
import type { CapabilityRunResult } from "@/server/capabilities";
import { runStudioCapability } from "@/server/studio-capability";
import { newsletterCampaignInputSchema } from "@atlasnews/core/newsletter/domain/newsletter";

/**
 * What the form says when a campaign capability refused: the refusal itself when it is about the person
 * (no permission) or a rule with a code, and otherwise the form's own sentence, as before.
 */
function failure(locale: Locale, outcome: Extract<CapabilityRunResult, { ok: false }>): StudioActionState {
  const own = locale === "it"
    ? "Non è stato possibile completare l’operazione. Controlla lo stato della campagna e riprova."
    : "The action could not be completed. Check the campaign and try again.";
  return { status: "error", message: outcome.status === 403 || outcome.code ? outcome.error : own };
}

/**
 * The campaign form: every intent is a catalogue capability (`admin_newsletter_*`), so the editor's scope,
 * the audit and the confirmation are the ones MCP gets. The form's own confirmation field (checked in
 * `parseNewsletterCampaignRequest`) is the person's approval of sending, scheduling or cancelling.
 */
export async function saveNewsletterCampaignAction(
  _previousState: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  const localeValue = formData.get("locale");
  const request = parseNewsletterCampaignRequest(formData);
  if (!isLocale(localeValue) || !request.success) {
    return { status: "error", message: localeValue === "it" ? "Richiesta non valida. Ricarica la pagina e riprova." : "That request is not valid. Reload the page and try again." };
  }

  const locale = localeValue;
  const intent = request.data.intent;
  const id = z.uuid().safeParse(formData.get("id"));
  await requireEditor(locale);
  const run = (name: string, input: unknown, confirmed = false) =>
    runStudioCapability(locale, name, input, confirmed ? { confirmed } : {});
  const open = (campaignId: string, updated: string): never => {
    revalidatePath(`/${locale}/studio/newsletter`);
    revalidatePath(`/${locale}/studio/newsletter/campaigns`);
    revalidatePath(`/${locale}/studio/newsletter/campaigns/${campaignId}`);
    redirect(`/${locale}/studio/newsletter/campaigns/${campaignId}?updated=${updated}`);
  };

  if (intent === "cancel") {
    if (!id.success) return { status: "error", message: locale === "it" ? "Campagna non trovata." : "Campaign not found." };
    const cancelled = await run("admin_newsletter_cancel_campaign", { id: id.data }, true);
    return cancelled.ok ? open(id.data, "cancelled") : failure(locale, cancelled);
  }

  const parsed = newsletterCampaignInputSchema.safeParse({
    id: id.success ? id.data : undefined,
    locale,
    subject: formData.get("subject"),
    preheader: formData.get("preheader") ?? "",
    fromName: formData.get("fromName"),
    fromEmail: formData.get("fromEmail"),
    replyTo: formData.get("replyTo") ?? "",
    contentMarkdown: formData.get("content"),
    audienceLocale: formData.get("audienceLocale"),
    audienceStatus: "active",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: locale === "it" ? "Controlla i campi evidenziati." : "Check the highlighted fields.",
      fieldErrors: studioFieldErrors(parsed.error, locale),
    };
  }

  let scheduledFor: string | null = null;
  if (intent === "schedule") {
    scheduledFor = parseUtcDateTimeInput(String(formData.get("scheduledFor") ?? ""));
    if (!scheduledFor || new Date(scheduledFor).getTime() <= Date.now()) {
      return {
        status: "error",
        message: locale === "it"
          ? "Inserisci una data UTC futura valida."
          : "Enter a valid future UTC date.",
        fieldErrors: {
          scheduledFor: [locale === "it" ? "La data deve essere futura." : "The date must be in the future."],
        },
      };
    }
  }

  // The capability takes the reply-to as the form wrote it: blank, not null.
  const saved = await run("admin_newsletter_save_campaign_draft", { ...parsed.data, replyTo: parsed.data.replyTo ?? "" });
  if (!saved.ok) return failure(locale, saved);
  const campaign = saved.result.campaign as { id: string };

  if (intent === "send") {
    const sent = await run("admin_newsletter_send_campaign", { id: campaign.id }, true);
    if (!sent.ok) return failure(locale, sent);
  } else if (intent === "schedule" && scheduledFor) {
    const scheduled = await run("admin_newsletter_schedule_campaign", { id: campaign.id, scheduledFor }, true);
    if (!scheduled.ok) return failure(locale, scheduled);
  }
  return open(campaign.id, intent);
}
