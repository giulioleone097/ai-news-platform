import { randomUUID } from "node:crypto";
import { z } from "zod";
import { EditorialRuleError } from "../../editorial/domain/errors";
import {
  NewsletterDeliveryConfigurationError,
  NewsletterDeliveryProviderError,
  newsletterCampaignInputSchema,
  summarizeNewsletterCampaign,
  type NewsletterCampaignInput,
  type NewsletterCampaignPatch,
  type NewsletterOutboxDelivery,
  type NewsletterProviderEvent,
} from "../domain/newsletter";
import {
  renderConfirmationEmailDocument,
  renderNewsletterEmailDocument,
} from "./markdown";
import type {
  NewsletterDeliveryProvider,
  NewsletterDeliveryRepository,
} from "../domain/ports";
import {
  buildConfirmationToken,
  createConfirmationChallenge,
  createUnsubscribeToken,
  hashNewsletterEmail,
  hashNewsletterRequestFingerprint,
  parseConfirmationToken,
  verifyUnsubscribeToken,
} from "./security";

const subscriptionRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  locale: z.enum(["en", "it"]),
  source: z.string().trim().regex(/^[a-z0-9:_-]{2,80}$/u).default("site"),
});

const subscriptionRequestContextSchema = z.object({
  requester: z.string().trim().min(1).max(512),
});

export class NewsletterCampaignService {
  constructor(
    private readonly repository: NewsletterDeliveryRepository,
    private readonly config: {
      fromEmail: string;
      replyTo: string | null;
      suppressionSecret: string;
    },
  ) {}

  defaults() {
    return { fromEmail: this.config.fromEmail, replyTo: this.config.replyTo };
  }

  async listCampaigns(input: { locale: "en" | "it"; limit?: number; offset?: number }) {
    const page = await this.repository.listCampaigns(input);
    // The adapters read whole campaigns, the body and its HTML included; a list answers the summary it declares.
    return { ...page, items: page.items.map(summarizeNewsletterCampaign) };
  }

  getCampaign(id: string) {
    return this.repository.getCampaign(z.uuid().parse(id));
  }

  listRecipients(campaignId: string, limit?: number) {
    return this.repository.listRecipients(z.uuid().parse(campaignId), limit);
  }

  saveDraft(input: NewsletterCampaignInput | unknown, createdBy: string) {
    const parsed = newsletterCampaignInputSchema.parse(input);
    if (parsed.fromEmail !== this.config.fromEmail) {
      throw new NewsletterDeliveryConfigurationError(
        "Campaign sender must match NEWSLETTER_FROM_EMAIL.",
      );
    }
    return this.repository.saveDraft(parsed, z.uuid().parse(createdBy));
  }

  /**
   * Changes some fields of a draft and keeps the others; the result is saved as the whole draft, so the
   * sender and the rendering are checked as in `saveDraft`. Only a draft can be edited.
   */
  async patchDraft(id: string, patch: NewsletterCampaignPatch, createdBy: string) {
    const changes = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    if (!Object.keys(changes).length) throw new EditorialRuleError("Nothing to change: pass at least one field of the draft.");
    const current = await this.draftOf(id, "edited");
    return this.saveDraft({
      id: current.id,
      locale: current.locale,
      subject: current.subject,
      preheader: current.preheader,
      fromName: current.fromName,
      fromEmail: current.fromEmail,
      replyTo: current.replyTo ?? "",
      contentMarkdown: current.contentMarkdown,
      audienceLocale: current.audienceLocale,
      audienceStatus: current.audienceStatus,
      ...changes,
    }, createdBy);
  }

  /** Removes a draft for good. A campaign that was queued, sent or cancelled stays as a record. */
  async deleteDraft(id: string) {
    const current = await this.draftOf(id, "deleted");
    if (!(await this.repository.deleteDraft(current.id))) {
      throw new EditorialRuleError("The campaign is no longer a draft, so it was not deleted.");
    }
    return current.id;
  }

  private async draftOf(id: string, verb: string) {
    const campaign = await this.getCampaign(id);
    if (!campaign) throw new EditorialRuleError("Newsletter campaign not found.");
    if (campaign.status !== "draft") {
      throw new EditorialRuleError(`Only a draft can be ${verb}; this campaign is ${campaign.status}.`);
    }
    return campaign;
  }

  sendNow(id: string) {
    return this.repository.queueCampaign(z.uuid().parse(id), null);
  }

  schedule(id: string, scheduledFor: string) {
    const date = z.iso.datetime({ offset: true }).parse(scheduledFor);
    if (new Date(date).getTime() <= Date.now()) {
      throw new Error("Scheduled delivery must be in the future.");
    }
    return this.repository.queueCampaign(z.uuid().parse(id), date);
  }

  cancel(id: string) {
    return this.repository.cancelCampaign(z.uuid().parse(id));
  }

  async eraseSubscription(subscriptionId: string) {
    const id = z.uuid().parse(subscriptionId);
    const email = await this.repository.getSubscriptionEmail(id);
    if (!email) return false;
    return this.repository.eraseSubscription({
      subscriptionId: id,
      emailHash: hashNewsletterEmail(email, this.config.suppressionSecret),
    });
  }
}

export class NewsletterDeliveryService {
  constructor(
    private readonly repository: NewsletterDeliveryRepository,
    private readonly provider: NewsletterDeliveryProvider,
    private readonly config: {
      baseUrl: URL;
      fromEmail: string;
      replyTo: string | null;
      unsubscribeSecret: string;
    },
  ) {
    if (config.unsubscribeSecret.length < 32) {
      throw new NewsletterDeliveryConfigurationError();
    }
  }

  async processOutboxBatch(input: { limit?: number; leaseSeconds?: number } = {}) {
    const workerId = `newsletter-${randomUUID()}`;
    const deliveries = await this.repository.claimOutbox({
      limit: Math.min(50, Math.max(1, input.limit ?? 9)),
      workerId,
      leaseSeconds: Math.min(900, Math.max(30, input.leaseSeconds ?? 120)),
    });
    const results: Array<{ outboxId: number; status: "failed" | "sent" | "skipped" }> = [];

    for (let index = 0; index < deliveries.length; index += 3) {
      const chunk = deliveries.slice(index, index + 3);
      results.push(...await Promise.all(chunk.map((delivery) => this.deliverOne(delivery, workerId))));
    }

    return {
      claimed: deliveries.length,
      sent: results.filter((result) => result.status === "sent").length,
      failed: results.filter((result) => result.status === "failed").length,
      skipped: results.filter((result) => result.status === "skipped").length,
    };
  }

  private async deliverOne(delivery: NewsletterOutboxDelivery, workerId: string) {
    try {
      if (delivery.fromEmail !== this.config.fromEmail) {
        throw new NewsletterDeliveryProviderError(
          "Campaign sender does not match configured sender.",
          { retryable: false },
        );
      }
      const token = createUnsubscribeToken({
        recipientId: delivery.recipientId,
        subscriptionId: delivery.subscriptionId,
      }, this.config.unsubscribeSecret);
      const unsubscribeUrlObject = new URL(
        `/api/webhooks/newsletter/unsubscribe/${encodeURIComponent(token)}`,
        this.config.baseUrl,
      );
      unsubscribeUrlObject.searchParams.set("locale", delivery.locale);
      const unsubscribeUrl = unsubscribeUrlObject.toString();
      const html = renderNewsletterEmailDocument({
        locale: delivery.locale,
        markdown: delivery.contentMarkdown,
        preheader: delivery.preheader,
        subject: delivery.subject,
        unsubscribeUrl,
        unsubscribeLabel: delivery.locale === "it" ? "Annulla iscrizione" : "Unsubscribe",
      });
      const started = await this.repository.startOutboxDelivery({
        outboxId: delivery.outboxId,
        workerId,
      });
      if (!started) return { outboxId: delivery.outboxId, status: "skipped" as const };
      const result = await this.provider.send({
        fromName: delivery.fromName,
        fromEmail: delivery.fromEmail,
        to: delivery.recipientEmail,
        replyTo: delivery.replyTo ?? this.config.replyTo,
        subject: delivery.subject,
        html,
        idempotencyKey: delivery.idempotencyKey,
        unsubscribeUrl,
      });
      const completed = await this.repository.completeOutbox({
        outboxId: delivery.outboxId,
        workerId,
        providerMessageId: result.messageId,
      });
      if (!completed) throw new Error("Newsletter outbox lease was lost after delivery.");
      return { outboxId: delivery.outboxId, status: "sent" as const };
    } catch (error) {
      const providerError = error instanceof NewsletterDeliveryProviderError ? error : null;
      const retryAfterSeconds = providerError?.retryAfterSeconds
        ?? Math.min(3_600, 30 * (2 ** Math.min(delivery.attempt - 1, 7)));
      await this.repository.failOutbox({
        outboxId: delivery.outboxId,
        workerId,
        error: error instanceof Error ? error.message : "Unknown newsletter delivery error.",
        retryable: providerError?.retryable ?? true,
        retryAfterSeconds,
      });
      return { outboxId: delivery.outboxId, status: "failed" as const };
    }
  }

  async recordProviderEvent(input: {
    event: NewsletterProviderEvent;
    recipientEmail?: string | null;
  }) {
    const inserted = await this.repository.recordProviderEvent(input.event);
    const reason = input.event.type === "email.bounced"
      ? "bounce"
      : input.event.type === "email.complained"
        ? "complaint"
        : null;
    if (reason && input.recipientEmail) {
      await this.repository.registerSuppression({
        providerMessageId: input.event.providerMessageId,
        emailHash: hashNewsletterEmail(input.recipientEmail, this.config.unsubscribeSecret),
        reason,
      });
    }
    return { duplicate: !inserted };
  }

  async requestSubscription(input: unknown, context: { requester: string }) {
    const request = subscriptionRequestSchema.parse(input);
    const requestContext = subscriptionRequestContextSchema.parse(context);
    const challenge = createConfirmationChallenge();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const requested = await this.repository.requestSubscription({
      ...request,
      tokenHash: challenge.hash,
      emailHash: hashNewsletterEmail(request.email, this.config.unsubscribeSecret),
      requestFingerprint: hashNewsletterRequestFingerprint(
        requestContext.requester,
        this.config.unsubscribeSecret,
      ),
      expiresAt,
    });

    if (!requested.shouldSend || !requested.subscriptionId) return { accepted: true as const };

    const token = buildConfirmationToken(requested.subscriptionId, challenge.secret);
    const confirmationUrlObject = new URL(
      `/api/webhooks/newsletter/confirm/${encodeURIComponent(token)}`,
      this.config.baseUrl,
    );
    confirmationUrlObject.searchParams.set("locale", request.locale);
    const confirmationUrl = confirmationUrlObject.toString();
    const subject = request.locale === "it"
      ? "Conferma la tua iscrizione a AtlasNews"
      : "Confirm your AtlasNews subscription";
    try {
      const result = await this.provider.sendConfirmation({
        fromEmail: this.config.fromEmail,
        to: request.email,
        subject,
        html: renderConfirmationEmailDocument({ confirmationUrl, locale: request.locale }),
        replyTo: this.config.replyTo,
        idempotencyKey: `newsletter-confirm:${requested.subscriptionId}:${challenge.hash.slice(0, 32)}`,
      });
      const completed = await this.repository.completeSubscriptionConfirmation({
        subscriptionId: requested.subscriptionId,
        tokenHash: challenge.hash,
        providerMessageId: result.messageId,
      });
      if (!completed) throw new Error("Newsletter confirmation lease was lost.");
    } catch (error) {
      await this.repository.releaseSubscriptionConfirmation({
        subscriptionId: requested.subscriptionId,
        tokenHash: challenge.hash,
      });
      throw error;
    }
    return { accepted: true as const };
  }

  confirmSubscription(token: string) {
    const parsed = parseConfirmationToken(token);
    if (!parsed) return Promise.resolve(false);
    return this.repository.confirmSubscription(parsed);
  }

  unsubscribe(token: string) {
    const parsed = verifyUnsubscribeToken(token, this.config.unsubscribeSecret);
    if (!parsed) return Promise.resolve(false);
    return this.repository.unsubscribe(parsed);
  }
}
