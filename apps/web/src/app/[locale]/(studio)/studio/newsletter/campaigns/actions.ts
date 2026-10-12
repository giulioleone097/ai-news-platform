"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { StudioActionState } from "@/components/studio/action-state";
import { studioFieldErrors } from "@/components/studio/field-errors";
import { parseNewsletterCampaignRequest } from "@/components/studio/newsletter-campaigns/campaign-confirmation";
import { isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { parseUtcDateTimeInput } from "@/lib/editorial-datetime";
import { getStudioNewsletterCampaignService } from "@/server/composition";
import { newsletterCampaignInputSchema } from "@atlasnews/core/newsletter/domain/newsletter";

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
  try {
    const editor = await requireEditor(locale);
    const service = await getStudioNewsletterCampaignService();

    if (intent === "cancel") {
      if (!id.success) return { status: "error", message: locale === "it" ? "Campagna non trovata." : "Campaign not found." };
      await service.cancel(id.data);
      revalidatePath(`/${locale}/studio/newsletter/campaigns`);
      revalidatePath(`/${locale}/studio/newsletter/campaigns/${id.data}`);
      redirect(`/${locale}/studio/newsletter/campaigns/${id.data}?updated=cancelled`);
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

    const campaign = await service.saveDraft(parsed.data, editor.userId);
    if (intent === "send") {
      await service.sendNow(campaign.id);
    } else if (intent === "schedule" && scheduledFor) {
      await service.schedule(campaign.id, scheduledFor);
    }

    revalidatePath(`/${locale}/studio/newsletter`);
    revalidatePath(`/${locale}/studio/newsletter/campaigns`);
    revalidatePath(`/${locale}/studio/newsletter/campaigns/${campaign.id}`);
    redirect(`/${locale}/studio/newsletter/campaigns/${campaign.id}?updated=${intent}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return {
      status: "error",
      message: locale === "it"
        ? "Non è stato possibile completare l’operazione. Controlla lo stato della campagna e riprova."
        : "The action could not be completed. Check the campaign and try again.",
    };
  }
}
