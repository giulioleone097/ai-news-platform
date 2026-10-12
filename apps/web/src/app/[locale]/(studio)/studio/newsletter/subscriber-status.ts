import type { NewsletterStatus } from "@atlasnews/core/editorial/domain/editorial-operations";
import type { BadgeTone } from "@/components/studio/badge";
import type { Locale } from "@/i18n";

/** Studio labels for the four subscription statuses, plus the tone of each. */
export const subscriberStatusLabels: Record<Locale, Record<NewsletterStatus, string>> = {
  en: {
    pending: "Awaiting confirmation",
    active: "Active",
    unsubscribed: "Unsubscribed",
    suppressed: "Blocked",
  },
  it: {
    pending: "In attesa di conferma",
    active: "Attivo",
    unsubscribed: "Disiscritto",
    suppressed: "Bloccato",
  },
};

export const suppressedHint: Record<Locale, string> = {
  en: "Bounced, reported as spam or erased. This address cannot be re-subscribed from the Studio.",
  it: "Rimbalzato, segnalato come spam o cancellato. Questo indirizzo non può essere reiscritto dallo Studio.",
};

/** The badge tone of each subscription status. */
export const subscriberStatusTone: Record<NewsletterStatus, BadgeTone> = {
  pending: "warning",
  active: "success",
  unsubscribed: "neutral",
  suppressed: "danger",
};
