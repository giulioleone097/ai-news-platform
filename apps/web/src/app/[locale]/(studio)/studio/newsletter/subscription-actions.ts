"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod/v4";
import { locales } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { runStudioCapability } from "@/server/studio-capability";

const confirmationSchema = z.object({
  email: z.email().trim().toLowerCase().max(254),
  locale: z.enum(locales),
});

export async function requestNewsletterReconfirmationAction(formData: FormData) {
  const input = confirmationSchema.parse({
    email: formData.get("email"),
    locale: formData.get("locale"),
  });
  await requireEditor(input.locale);

  // The editor chose to send this confirmation on the newsletter screen. The capability sends the same
  // double opt-in email as MCP does, and records the Studio as its source.
  const outcome = await runStudioCapability(
    input.locale,
    "admin_newsletter_request_subscription",
    { email: input.email, locale: input.locale, source: "studio-reactivation" },
    { confirmed: true },
  );
  if (!outcome.ok) redirect(`/${input.locale}/studio/newsletter?error=confirmation`);

  revalidatePath(`/${input.locale}/studio/newsletter`);
  redirect(`/${input.locale}/studio/newsletter?confirmation=1`);
}
