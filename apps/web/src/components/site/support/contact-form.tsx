"use client";

import { useRef, useState } from "react";
import { contactPolicy } from "@atlasnews/core/support/domain/policy";
import type { Locale } from "@/i18n";
import type { ContactCopy } from "./support-copy";
import styles from "./support.module.css";

type Field = "name" | "email" | "subject" | "body";
type Errors = Partial<Record<Field, string>>;
type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "failed"; message: string };

const fields: readonly Field[] = ["name", "email", "subject", "body"];
const emailShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function invalidFields(values: Record<Field, string>): Field[] {
  const name = values.name.trim();
  const subject = values.subject.trim();
  const body = values.body.trim();
  const email = values.email.trim();
  return fields.filter((field) => {
    switch (field) {
      case "name": return name.length < contactPolicy.minName || name.length > contactPolicy.maxName;
      case "email": return !emailShape.test(email) || email.length > contactPolicy.maxEmail;
      case "subject": return subject.length < contactPolicy.minSubject || subject.length > contactPolicy.maxSubject || /[\r\n]/u.test(subject);
      case "body": return body.length < contactPolicy.minBody || body.length > contactPolicy.maxBody;
    }
  });
}

export function ContactForm({
  locale,
  copy,
  privacyHref,
}: {
  locale: Locale;
  copy: ContactCopy;
  privacyHref: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const sending = status.kind === "sending";

  function show(invalid: readonly Field[]) {
    setErrors(Object.fromEntries(invalid.map((field) => [field, copy.errors[field]])));
    const first = invalid[0];
    if (first) (formRef.current?.elements.namedItem(first) as HTMLElement | null)?.focus();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const values = Object.fromEntries(fields.map((field) => [field, String(data.get(field) ?? "")])) as Record<Field, string>;
    const invalid = invalidFields(values);
    setStatus({ kind: "idle" });
    show(invalid);
    if (invalid.length) return;

    setStatus({ kind: "sending" });
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, locale, website: String(data.get("website") ?? "") }),
      });
      if (response.ok) {
        form.reset();
        setStatus({ kind: "sent" });
        return;
      }
      const problem = (await response.json().catch(() => ({}))) as { error?: string; fields?: string[] };
      if (response.status === 400 && problem.fields?.length) {
        show(problem.fields.filter((field): field is Field => (fields as readonly string[]).includes(field)));
        setStatus({ kind: "idle" });
        return;
      }
      setStatus({
        kind: "failed",
        message: response.status === 429 ? copy.errors.rateLimited : copy.errors.unavailable,
      });
    } catch {
      setStatus({ kind: "failed", message: copy.errors.network });
    }
  }

  const invalidCount = Object.keys(errors).length;
  const labels: Record<Field, string> = { name: copy.name, email: copy.email, subject: copy.subject, body: copy.body };
  const errorId = (field: Field) => `contact-${field}-error`;
  const describe = (field: Field, extra?: string) =>
    [errors[field] ? errorId(field) : null, extra].filter(Boolean).join(" ") || undefined;

  return (
    <section className={styles.contact} aria-labelledby="contact-title">
      <h2 id="contact-title">{copy.title}</h2>
      <p>{copy.description}</p>
      <form ref={formRef} className={styles.form} noValidate onSubmit={(event) => void submit(event)}>
        {invalidCount ? <p className={styles.summary} role="alert">{copy.errorSummary}</p> : null}

        <div className={styles.field}>
          <label htmlFor="contact-name">{labels.name}</label>
          <input
            id="contact-name"
            name="name"
            autoComplete="name"
            maxLength={contactPolicy.maxName}
            required
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describe("name")}
            disabled={sending}
          />
          {errors.name ? <p className={styles.error} id={errorId("name")}>{errors.name}</p> : null}
        </div>

        <div className={styles.field}>
          <label htmlFor="contact-email">{labels.email}</label>
          <input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={contactPolicy.maxEmail}
            required
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={describe("email")}
            disabled={sending}
          />
          {errors.email ? <p className={styles.error} id={errorId("email")}>{errors.email}</p> : null}
        </div>

        <div className={styles.field}>
          <label htmlFor="contact-subject">{labels.subject}</label>
          <input
            id="contact-subject"
            name="subject"
            maxLength={contactPolicy.maxSubject}
            required
            aria-invalid={errors.subject ? true : undefined}
            aria-describedby={describe("subject")}
            disabled={sending}
          />
          {errors.subject ? <p className={styles.error} id={errorId("subject")}>{errors.subject}</p> : null}
        </div>

        <div className={styles.field}>
          <label htmlFor="contact-body">{labels.body}</label>
          <textarea
            id="contact-body"
            name="body"
            rows={7}
            maxLength={contactPolicy.maxBody}
            required
            aria-invalid={errors.body ? true : undefined}
            aria-describedby={describe("body", "contact-body-hint")}
            disabled={sending}
          />
          <small id="contact-body-hint">{copy.bodyHint}</small>
          {errors.body ? <p className={styles.error} id={errorId("body")}>{errors.body}</p> : null}
        </div>

        <div className={styles.trap} aria-hidden="true">
          <label>
            Website
            <input autoComplete="off" name="website" tabIndex={-1} />
          </label>
        </div>

        <p className={styles.note}>
          {copy.privacyBefore} <a href={privacyHref}>{copy.privacyLink}</a>{copy.privacyAfter}
        </p>
        <button className={styles.submit} disabled={sending} type="submit">
          {sending ? copy.submitting : copy.submit}
        </button>
        <p className={styles.success} role="status" aria-live="polite">
          {status.kind === "sent" ? copy.success : ""}
        </p>
        {status.kind === "failed" ? <p className={styles.error} role="alert">{status.message}</p> : null}
      </form>
    </section>
  );
}
