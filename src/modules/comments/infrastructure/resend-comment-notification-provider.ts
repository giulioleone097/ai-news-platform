import type { CommentNotificationProvider } from "../application/notification-outbox";
import type { CommentNotificationEvent } from "../domain/comment";
import { ResendNewsletterProvider } from "@/modules/newsletter-delivery/resend-provider";
import { createNotificationToken } from "./identity-token";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function payloadText(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

export class ResendCommentNotificationProvider implements CommentNotificationProvider {
  private readonly provider: ResendNewsletterProvider;

  constructor(private readonly config: {
    apiKey: string;
    baseUrl: URL;
    guestSecret: string;
    fromEmail: string;
    replyTo: string | null;
    endpoint?: string;
    fetch?: typeof fetch;
  }) {
    this.provider = new ResendNewsletterProvider({
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      fetch: config.fetch,
    });
  }

  async send(event: CommentNotificationEvent) {
    const token = createNotificationToken(this.config.guestSecret, event.subscriptionId);
    const verifyUrl = new URL(`/${event.locale}/comments/notifications/verify`, this.config.baseUrl);
    verifyUrl.searchParams.set("token", token);
    const unsubscribeUrl = new URL(`/${event.locale}/comments/notifications/unsubscribe`, this.config.baseUrl);
    unsubscribeUrl.searchParams.set("token", token);
    const articleSlug = payloadText(event.payload, "articleSlug");
    const articleUrl = articleSlug && slugPattern.test(articleSlug)
      ? new URL(`/${event.locale}/articles/${articleSlug}#comments`, this.config.baseUrl)
      : new URL(`/${event.locale}`, this.config.baseUrl);
    const status = payloadText(event.payload, "status");

    const localized = event.locale === "it";
    const subject = event.kind === "verification"
      ? localized ? "Conferma le notifiche dei commenti NEURA" : "Confirm NEURA comment notifications"
      : event.kind === "reply"
        ? localized ? "Una nuova risposta al tuo commento" : "A new reply to your comment"
        : localized ? "Aggiornamento sul tuo commento" : "An update about your comment";
    const headline = event.kind === "verification"
      ? localized ? "Conferma le notifiche" : "Confirm notifications"
      : event.kind === "reply"
        ? localized ? "Hai ricevuto una risposta" : "You received a reply"
        : localized ? "Il tuo commento è stato revisionato" : "Your comment was reviewed";
    const actionUrl = event.kind === "verification" ? verifyUrl : articleUrl;
    const actionLabel = event.kind === "verification"
      ? localized ? "Conferma" : "Confirm"
      : localized ? "Apri la conversazione" : "Open conversation";
    const detail = event.kind === "moderation" && status
      ? localized ? `Nuovo stato: ${status}.` : `New status: ${status}.`
      : localized
        ? "Puoi gestire o disattivare queste notifiche in qualsiasi momento."
        : "You can manage or disable these notifications at any time.";
    const html = `<!doctype html><html lang="${event.locale}"><body style="margin:0;background:#f5f3ee;color:#191918;font-family:Arial,sans-serif"><div style="max-width:640px;margin:auto;padding:40px 24px"><p style="font-size:13px;letter-spacing:.12em;text-transform:uppercase">NEURA · COMMUNITY</p><h1 style="font-size:32px;line-height:1.1">${escapeHtml(headline)}</h1><p style="font-size:17px;line-height:1.6">${escapeHtml(detail)}</p><p style="margin:32px 0"><a href="${escapeHtml(actionUrl.toString())}" style="background:#191918;color:#fff;padding:14px 20px;border-radius:8px;text-decoration:none;font-weight:700">${escapeHtml(actionLabel)}</a></p><p style="font-size:13px"><a href="${escapeHtml(unsubscribeUrl.toString())}">${localized ? "Disattiva notifiche" : "Unsubscribe from notifications"}</a></p></div></body></html>`;

    return this.provider.send({
      fromName: "NEURA",
      fromEmail: this.config.fromEmail,
      to: event.recipientEmail,
      subject,
      html,
      replyTo: this.config.replyTo,
      idempotencyKey: `comment-notification:${event.id}`,
      unsubscribeUrl: unsubscribeUrl.toString(),
    });
  }
}
