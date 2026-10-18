"use client";

import { useActionState, type ReactNode } from "react";
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
  icon,
  source = "site",
}: {
  locale: Locale;
  copy: Messages["newsletter"];
  /** Server-rendered so the icon library stays out of the client bundle. */
  icon: ReactNode;
  source?: string;
}) {
  const [state, action, pending] = useActionState(
    subscribeToNewsletter,
    initialNewsletterState,
  );
  const emailId = `newsletter-email-${source}`;
  const messageId = `newsletter-message-${source}`;

  return (
    <section className="newsletter" id="newsletter" aria-labelledby="newsletter-band-title">
      <div className="newsletter__intro">
        {icon}
        <h2 id="newsletter-band-title">{copy.title}</h2>
        <p>{copy.description}</p>
      </div>
      <form className="newsletter__form" action={action}>
        <input type="hidden" name="source" value={source} />
        <input type="hidden" name="locale" value={locale} />
        <label className="sr-only" htmlFor={emailId}>{copy.emailLabel}</label>
        <input
          className="input"
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
        <button className="button" type="submit" disabled={pending}>
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
