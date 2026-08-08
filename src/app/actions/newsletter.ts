"use server";

import { z } from "zod";
import { getMessages, normalizeLocale } from "@/i18n";
import { getPublicEditorialRepositories } from "@/modules/editorial/infrastructure/container";

const subscriptionSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  source: z.string().trim().min(2).max(80).default("site"),
  locale: z.string().trim().max(16).default("en"),
});

export interface NewsletterState {
  status: "idle" | "success" | "error";
  message: string;
}

export async function subscribeToNewsletter(
  _previousState: NewsletterState,
  formData: FormData,
): Promise<NewsletterState> {
  const result = subscriptionSchema.safeParse({
    email: formData.get("email"),
    source: formData.get("source") || "site",
    locale: formData.get("locale") || "en",
  });

  const locale = normalizeLocale(formData.get("locale"));
  const copy = getMessages(locale).newsletter;

  if (!result.success) {
    return { status: "error", message: copy.invalidEmail };
  }

  try {
    const { newsletter } = getPublicEditorialRepositories();
    await newsletter.subscribe(result.data.email, result.data.source, locale);
    return { status: "success", message: copy.success };
  } catch {
    return {
      status: "error",
      message: copy.unavailable,
    };
  }
}
