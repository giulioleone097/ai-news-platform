import type {
  NewsletterCampaignInput,
  NewsletterCampaignRecipient,
  NewsletterCampaignSummary,
} from "@atlasnews/core/newsletter/domain/newsletter";
import { renderSafeNewsletterMarkdown } from "@atlasnews/core/newsletter/application/markdown";
import type { NewsletterCampaignPage, NewsletterCampaignRepository } from "@atlasnews/core/newsletter/domain/ports";
import type { D1PreparedStatement } from "../../sites/cloudflare";
import { D1NewsletterAccess } from "./access";
import {
  campaignColumns,
  type CampaignRow,
  type RecipientRow,
  mapCampaign,
  refusal,
  rowsOf,
  toIso,
  sqlUuid,
  cancellableOutbox,
  dispatchInFlight,
} from "./sql";

/** The campaigns an editor writes, queues and cancels. */
export class D1NewsletterCampaignRepository extends D1NewsletterAccess implements NewsletterCampaignRepository {
  private selectCampaign(id: string) {
    return this.statement(`SELECT ${campaignColumns} FROM newsletter_campaigns WHERE id = ?1`, id);
  }

  private async findCampaign(id: string) {
    return (await this.selectCampaign(id).first<CampaignRow>()) ?? null;
  }

  /** Runs `writes`, then reads the campaign back in the same batch, so the result reflects those writes. */
  private async writeCampaign(id: string, writes: D1PreparedStatement[]) {
    const results = await this.database.batch([...writes, this.selectCampaign(id)]);
    return { results, campaign: rowsOf<CampaignRow>(results[results.length - 1])[0] ?? null };
  }

  async listCampaigns(input: { locale: "en" | "it"; limit?: number; offset?: number }): Promise<NewsletterCampaignPage> {
    const limit = Math.min(100, Math.max(1, input.limit ?? 50));
    const offset = Math.max(0, input.offset ?? 0);
    const [page, count] = await this.database.batch([
      this.statement(
        `SELECT ${campaignColumns} FROM newsletter_campaigns WHERE locale = ?1
         ORDER BY created_at DESC, id DESC LIMIT ?2 OFFSET ?3`,
        input.locale,
        limit,
        offset,
      ),
      this.statement("SELECT count(*) AS total FROM newsletter_campaigns WHERE locale = ?1", input.locale),
    ]);
    return {
      items: rowsOf<CampaignRow>(page).map(mapCampaign) as NewsletterCampaignSummary[],
      total: rowsOf<{ total: number }>(count)[0]?.total ?? 0,
    };
  }

  async getCampaign(id: string) {
    const row = await this.findCampaign(id);
    return row ? mapCampaign(row) : null;
  }

  async listRecipients(campaignId: string, limit = 100): Promise<NewsletterCampaignRecipient[]> {
    const { results } = await this.statement(
      `SELECT id, email, delivery_status, provider_message_id, sent_at, delivered_at, bounced_at, complained_at,
         opened_at, clicked_at, last_error
       FROM newsletter_campaign_recipients WHERE campaign_id = ?1
       ORDER BY created_at ASC, rowid ASC LIMIT ?2`,
      campaignId,
      Math.min(500, Math.max(1, limit)),
    ).all<RecipientRow>();
    return results.map((row) => ({
      id: row.id,
      email: row.email,
      deliveryStatus: row.delivery_status,
      providerMessageId: row.provider_message_id,
      sentAt: row.sent_at,
      deliveredAt: row.delivered_at,
      bouncedAt: row.bounced_at,
      complainedAt: row.complained_at,
      openedAt: row.opened_at,
      clickedAt: row.clicked_at,
      lastError: row.last_error,
    }));
  }

  async saveDraft(input: NewsletterCampaignInput, createdBy: string) {
    const content = [
      input.locale,
      input.subject,
      input.preheader,
      input.fromName,
      input.fromEmail,
      input.replyTo,
      input.contentMarkdown,
      renderSafeNewsletterMarkdown(input.contentMarkdown),
      input.audienceLocale,
      input.audienceStatus,
    ];

    if (input.id) {
      const { results, campaign } = await this.writeCampaign(input.id, [
        this.statement(
          `UPDATE newsletter_campaigns SET locale = ?2, subject = ?3, preheader = ?4, from_name = ?5, from_email = ?6,
             reply_to = ?7, content_markdown = ?8, content_html = ?9, audience_locale = ?10, audience_status = ?11
           WHERE id = ?1 AND status = 'draft'`,
          input.id,
          ...content,
        ),
      ]);
      if (results[0].meta.changes === 0 || !campaign) {
        throw refusal("update newsletter draft", "no draft campaign with that id");
      }
      return mapCampaign(campaign);
    }

    const id = crypto.randomUUID();
    const { campaign } = await this.writeCampaign(id, [
      this.statement(
        `INSERT INTO newsletter_campaigns (id, locale, subject, preheader, from_name, from_email, reply_to,
           content_markdown, content_html, audience_locale, audience_status, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
        id,
        ...content,
        createdBy,
      ),
    ]);
    if (!campaign) throw refusal("create newsletter draft", "the campaign was not stored");
    return mapCampaign(campaign);
  }

  async deleteDraft(id: string) {
    // A draft has no recipients or outbox rows yet, so the row goes alone; a campaign that left draft stays.
    const result = await this.statement("DELETE FROM newsletter_campaigns WHERE id = ?1 AND status = 'draft'", id).run();
    return result.meta.changes > 0;
  }

  async queueCampaign(id: string, scheduledFor: string | null) {
    const operation = "queue newsletter campaign";
    const now = new Date().toISOString();
    const scheduled = scheduledFor === null
      ? null
      : toIso(scheduledFor, operation, "Scheduled delivery must be in the future");
    const campaign = await this.findCampaign(id);
    if (!campaign) throw refusal(operation, "Newsletter campaign not found");

    // Queueing twice is a no-op, as in the Postgres function.
    if ((campaign.status === "sending" || campaign.status === "sent") && scheduled === null) {
      return mapCampaign(campaign);
    }
    if (campaign.status === "scheduled" && scheduled !== null && campaign.scheduled_for === scheduled) {
      return mapCampaign(campaign);
    }
    if (campaign.status !== "draft") throw refusal(operation, "Only draft campaigns can be queued");
    if (campaign.content_markdown.trim().length < 20) throw refusal(operation, "Campaign content is incomplete");
    if (scheduled !== null && scheduled <= now) throw refusal(operation, "Scheduled delivery must be in the future");

    // The snapshot, the outbox and the state change land together; every statement only acts on a campaign
    // that is still a draft, so a concurrent queue turns this one into a no-op.
    const { campaign: queued } = await this.writeCampaign(id, [
      this.statement(
        `INSERT INTO newsletter_campaign_recipients (id, campaign_id, subscription_id, email, locale)
         SELECT ${sqlUuid}, c.id, s.id, s.email, s.locale
         FROM newsletter_campaigns AS c
         JOIN newsletter_subscriptions AS s ON s.locale = c.audience_locale AND s.status = c.audience_status
         WHERE c.id = ?1 AND c.status = 'draft'
         ORDER BY s.id
         ON CONFLICT (campaign_id, subscription_id) DO NOTHING`,
        id,
      ),
      this.statement(
        `INSERT INTO newsletter_outbox (campaign_id, recipient_id, available_at, idempotency_key)
         SELECT r.campaign_id, r.id, ?2, 'newsletter:' || r.campaign_id || ':' || r.id
         FROM newsletter_campaign_recipients AS r
         JOIN newsletter_campaigns AS c ON c.id = r.campaign_id
         WHERE r.campaign_id = ?1 AND c.status = 'draft'
         ORDER BY r.id
         ON CONFLICT (recipient_id) DO NOTHING`,
        id,
        scheduled ?? now,
      ),
      this.statement(
        `UPDATE newsletter_campaigns SET
           status = CASE WHEN ?2 IS NULL THEN 'sending' ELSE 'scheduled' END,
           scheduled_for = ?2,
           started_at = CASE WHEN ?2 IS NULL THEN coalesce(started_at, ?3) ELSE NULL END,
           recipient_count = (SELECT count(*) FROM newsletter_campaign_recipients WHERE campaign_id = ?1)
         WHERE id = ?1 AND status = 'draft'
           AND EXISTS (SELECT 1 FROM newsletter_campaign_recipients WHERE campaign_id = ?1)`,
        id,
        scheduled,
        now,
      ),
    ]);
    if (!queued) throw refusal(operation, "Newsletter campaign not found");
    // Still a draft means no subscriber matched, and then nothing above wrote anything.
    if (queued.status === "draft") throw refusal(operation, "Campaign audience is empty");
    return mapCampaign(queued);
  }

  async cancelCampaign(id: string) {
    const operation = "cancel newsletter campaign";
    const current = await this.findCampaign(id);
    if (!current) throw refusal(operation, "Newsletter campaign not found");
    if (current.status === "cancelled") return mapCampaign(current);
    if (!["draft", "scheduled", "sending"].includes(current.status)) {
      throw refusal(operation, "Only draft, scheduled or sending campaigns can be cancelled");
    }

    const now = new Date().toISOString();
    const { campaign } = await this.writeCampaign(id, [
      this.statement(
        `UPDATE newsletter_outbox AS o SET status = 'cancelled', worker_id = NULL, lease_expires_at = NULL
         WHERE o.campaign_id = ?1 AND ${cancellableOutbox}`,
        id,
      ),
      this.statement(
        `UPDATE newsletter_campaign_recipients AS r SET delivery_status = 'cancelled'
         WHERE r.campaign_id = ?1 AND r.delivery_status IN ('pending', 'sending')
           AND NOT ${dispatchInFlight("r.id")}`,
        id,
      ),
      this.statement(
        `UPDATE newsletter_campaigns SET status = 'cancelled', cancelled_at = ?2
         WHERE id = ?1 AND status IN ('draft', 'scheduled', 'sending')`,
        id,
        now,
      ),
    ]);
    if (campaign?.status !== "cancelled") {
      throw refusal(operation, "Only draft, scheduled or sending campaigns can be cancelled");
    }
    return mapCampaign(campaign);
  }
}
