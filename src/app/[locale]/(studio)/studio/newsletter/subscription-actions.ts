"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod/v4";
import { locales } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getNewsletterDeliveryService } from "@/modules/newsletter-delivery/container";

const confirmationSchema = z.object({
  email: z.email().trim().toLowerCase().max(254),
  locale: z.enum(locales),
});

export async function requestNewsletterReconfirmationAction(formData: FormData) {
  const input = confirmationSchema.parse({
    email: formData.get("email"),
    locale: formData.get("locale"),
  });
  const editor = await requireEditor(input.locale);

  try {
    await getNewsletterDeliveryService().requestSubscription({
      email: input.email,
      locale: input.locale,
      source: "studio-reactivation",
    }, { requester: `studio:${editor.userId}` });
  } catch {
    redirect(`/${input.locale}/studio/newsletter?error=confirmation`);
  }

  revalidatePath(`/${input.locale}/studio/newsletter`);
  redirect(`/${input.locale}/studio/newsletter?confirmation=1`);
}
