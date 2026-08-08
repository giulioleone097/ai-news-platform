"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";
import {
  subscribeToNewsletter,
  type NewsletterState,
} from "@/app/actions/newsletter";
import type { Locale, Messages } from "@/i18n";

const initialNewsletterState: NewsletterState = {
  status: "idle",
  message: "",
};

export function NewsletterForm({
  locale,
  copy,
  source = "site",
}: {
  locale: Locale;
  copy: Messages["newsletter"];
  source?: string;
}) {
  const [state, action, pending] = useActionState(
    subscribeToNewsletter,
    initialNewsletterState,
  );
  const emailId = `newsletter-email-${source}`;
  const messageId = `newsletter-message-${source}`;

  return (
    <section className="newsletter" aria-labelledby="newsletter-title">
      <div className="newsletter__intro">
        <span className="newsletter__icon" aria-hidden="true"><Mail /></span>
        <div>
          <h2 id="newsletter-title">{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
      </div>
      <form action={action}>
        <input type="hidden" name="source" value={source} />
        <input type="hidden" name="locale" value={locale} />
        <label className="sr-only" htmlFor={emailId}>{copy.emailLabel}</label>
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          placeholder={copy.emailPlaceholder}
          required
          disabled={pending}
          aria-describedby={state.message ? messageId : undefined}
          aria-invalid={state.status === "error" || undefined}
        />
        <button type="submit" disabled={pending}>
          {pending ? copy.submitting : copy.submit}
        </button>
        <small>{copy.privacy}</small>
        <p
          className={`form-message form-message--${state.status}`}
          id={messageId}
          role="status"
          aria-live="polite"
        >
          {state.message}
        </p>
      </form>
    </section>
  );
}
