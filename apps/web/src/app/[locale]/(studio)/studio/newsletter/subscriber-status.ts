import type { NewsletterStatus } from "@atlasnews/core/editorial/domain/editorial-operations";
import type { Locale } from "@/i18n";

/** Studio labels for the four subscription statuses, plus the existing status chip style to reuse. */
export const subscriberStatusLabels: Record<Locale, Record<NewsletterStatus, string>> = {
  en: {
    pending: "Awaiting confirmation",
    active: "Active",
    unsubscribed: "Unsubscribed",
    suppressed: "Suppressed",
  },
  it: {
    pending: "In attesa di conferma",
    active: "Attivi",
    unsubscribed: "Disiscritti",
    suppressed: "Soppressi",
  },
};

export const suppressedHint: Record<Locale, string> = {
  en: "Bounced, reported as spam or erased. This address cannot be re-subscribed from the Studio.",
  it: "Rimbalzato, segnalato come spam o cancellato. Questo indirizzo non può essere reiscritto dallo Studio.",
};

/** Chip modifier; `pending` and `suppressed` borrow the review (warning) and failed (error) styles. */
export const subscriberStatusTone: Record<NewsletterStatus, string> = {
  pending: "review",
  active: "active",
  unsubscribed: "unsubscribed",
  suppressed: "failed",
};
