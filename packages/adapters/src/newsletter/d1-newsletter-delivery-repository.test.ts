import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NewsletterCampaignInput } from "@atlasnews/core/newsletter/domain/newsletter";
import type { D1Database } from "../sites/cloudflare";
import { createSitesTestStore, type SitesTestStore } from "../sites/testing";
import type { NewsletterDeliveryRepository } from "@atlasnews/core/newsletter/domain/ports";
import { createD1NewsletterDeliveryRepository } from "./d1-newsletter-delivery-repository";

const hex = (seed: number) => seed.toString(16).padStart(64, "0");
const worker = "worker-aaaaaaaa";
const editor = crypto.randomUUID();

let store: SitesTestStore;
let database: D1Database;
let repository: NewsletterDeliveryRepository;

beforeAll(async () => {
  store = await createSitesTestStore();
  database = store.database;
  repository = createD1NewsletterDeliveryRepository(database);
});

afterAll(async () => {
  await store.dispose();
});

beforeEach(async () => {
  await database.batch(
    [
      "newsletter_delivery_events",
      "newsletter_outbox",
      "newsletter_campaign_recipients",
      "newsletter_campaigns",
      "newsletter_subscriptions",
      "newsletter_suppressions",
      "newsletter_subscription_request_limits",
    ].map((table) => database.prepare(`DELETE FROM ${table}`)),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function rows<T = Record<string, unknown>>(sql: string, ...values: unknown[]) {
  return (await database.prepare(sql).bind(...values).all<T>()).results;
}

async function run(sql: string, ...values: unknown[]) {
  await database.prepare(sql).bind(...values).run();
}

async function addSubscriber(email: string, options: { locale?: "en" | "it"; status?: string } = {}) {
  const id = crypto.randomUUID();
  const status = options.status ?? "active";
  await run(
    `INSERT INTO newsletter_subscriptions (id, email, locale, status, confirmed_at)
     VALUES (?1, ?2, ?3, ?4, CASE WHEN ?4 = 'active' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END)`,
    id,
    email,
    options.locale ?? "en",
    status,
  );
  return id;
}

function draftInput(overrides: Partial<NewsletterCampaignInput> = {}): NewsletterCampaignInput {
  return {
    locale: "en",
    subject: "Weekly digest",
    preheader: "",
    fromName: "AtlasNews",
    fromEmail: "news@example.com",
    replyTo: null,
    contentMarkdown: "# Weekly\n\nThis is the body of the digest.",
    audienceLocale: "en",
    audienceStatus: "active",
    ...overrides,
  };
}

/** A campaign that is sending to `count` active English subscribers. */
async function sendingCampaign(count: number) {
  for (let index = 0; index < count; index += 1) await addSubscriber(`reader${index}@example.com`);
  const draft = await repository.saveDraft(draftInput(), editor);
  return repository.queueCampaign(draft.id, null);
}

async function claimAll(limit = 50) {
  return repository.claimOutbox({ limit, workerId: worker, leaseSeconds: 60 });
}

/** Claims, starts and completes the delivery of every queued recipient. */
async function sendAll() {
  const claimed = await claimAll();
  for (const delivery of claimed) {
    expect(await repository.startOutboxDelivery({ outboxId: delivery.outboxId, workerId: worker })).toBe(true);
    expect(await repository.completeOutbox({
      outboxId: delivery.outboxId,
      workerId: worker,
      providerMessageId: `msg-${delivery.outboxId}`,
    })).toBe(true);
  }
  return claimed;
}

const request = (email: string, overrides: Partial<Parameters<NewsletterDeliveryRepository["requestSubscription"]>[0]> = {}) =>
  repository.requestSubscription({
    email,
    source: "site",
    locale: "en",
    tokenHash: hex(1),
    emailHash: hex(2),
    requestFingerprint: hex(3),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides,
  });

describe("double opt-in", () => {
  it("stores a pending subscription, sends once, and confirms only with the issued token", async () => {
    const requested = await request("Reader@Example.com ");
    expect(requested).toMatchObject({ status: "pending", shouldSend: true });
    const id = requested.subscriptionId!;
    expect(await repository.getSubscriptionEmail(id)).toBe("reader@example.com");

    // Until the confirmation mail is out, only the holder of the lease may release it.
    expect(await repository.releaseSubscriptionConfirmation({ subscriptionId: id, tokenHash: hex(9) })).toBe(false);
    expect(await repository.completeSubscriptionConfirmation({ subscriptionId: id, tokenHash: hex(9), providerMessageId: "m" })).toBe(false);
    expect(await repository.completeSubscriptionConfirmation({ subscriptionId: id, tokenHash: hex(1), providerMessageId: "m1" })).toBe(true);
    expect(await repository.releaseSubscriptionConfirmation({ subscriptionId: id, tokenHash: hex(1) })).toBe(false);

    // A second request while the first mail is fresh sends nothing and reveals nothing new.
    expect(await request("reader@example.com", { tokenHash: hex(4) })).toEqual({
      subscriptionId: id,
      status: "pending",
      shouldSend: false,
    });

    expect(await repository.confirmSubscription({ subscriptionId: id, tokenHash: hex(9) })).toBe(false);
    expect(await repository.confirmSubscription({ subscriptionId: id, tokenHash: hex(1) })).toBe(true);
    expect(await repository.confirmSubscription({ subscriptionId: id, tokenHash: hex(1) })).toBe(false);
    expect(await rows("SELECT status, confirmed_at, confirmation_token_hash FROM newsletter_subscriptions")).toEqual([
      expect.objectContaining({ status: "active", confirmation_token_hash: null }),
    ]);
    expect(await request("reader@example.com")).toEqual({ subscriptionId: id, status: "active", shouldSend: false });
  });

  it("does not confirm an expired token, and a released claim can be requested again at once", async () => {
    const { subscriptionId } = await request("late@example.com");
    await run("UPDATE newsletter_subscriptions SET confirmation_expires_at = '2020-01-01T00:00:00.000Z'");
    expect(await repository.confirmSubscription({ subscriptionId: subscriptionId!, tokenHash: hex(1) })).toBe(false);

    expect(await repository.releaseSubscriptionConfirmation({ subscriptionId: subscriptionId!, tokenHash: hex(1) })).toBe(true);
    expect(await request("late@example.com", { tokenHash: hex(5) })).toMatchObject({ status: "pending", shouldSend: true });
  });

  it("brings an unsubscribed address back to pending with a fresh token", async () => {
    const id = await addSubscriber("back@example.com", { status: "unsubscribed" });
    expect(await request("back@example.com", { tokenHash: hex(6) })).toEqual({ subscriptionId: id, status: "pending", shouldSend: true });
    expect(await rows("SELECT status, confirmation_token_hash, unsubscribed_at FROM newsletter_subscriptions")).toEqual([
      { status: "pending", confirmation_token_hash: hex(6), unsubscribed_at: null },
    ]);
  });

  it("answers a suppressed or already suppressed address without writing anything", async () => {
    await run("INSERT INTO newsletter_suppressions (email_hash, reason) VALUES (?1, 'bounce')", hex(2));
    expect(await request("gone@example.com")).toEqual({ subscriptionId: null, status: "suppressed", shouldSend: false });
    expect(await rows("SELECT id FROM newsletter_subscriptions")).toEqual([]);
    expect(await rows("SELECT scope_key FROM newsletter_subscription_request_limits")).toEqual([]);

    const id = await addSubscriber("held@example.com", { status: "suppressed" });
    expect(await request("held@example.com", { emailHash: hex(7) })).toEqual({ subscriptionId: id, status: "suppressed", shouldSend: false });
  });

  it("rejects malformed requests with the Postgres messages", async () => {
    await expect(request("not-an-email")).rejects.toThrow("Unable to request newsletter subscription: Invalid newsletter email");
    await expect(request("a@example.com", { source: "Bad Source" })).rejects.toThrow("Invalid newsletter source");
    await expect(request("a@example.com", { locale: "fr" as "en" })).rejects.toThrow("Invalid newsletter locale");
    await expect(request("a@example.com", { tokenHash: "xyz" })).rejects.toThrow("Invalid newsletter token");
    await expect(request("a@example.com", { expiresAt: new Date(Date.now() - 1000).toISOString() })).rejects.toThrow(
      "Invalid newsletter confirmation expiry",
    );
    await expect(request("a@example.com", { expiresAt: new Date(Date.now() + 49 * 3_600_000).toISOString() })).rejects.toThrow(
      "Invalid newsletter confirmation expiry",
    );
  });
});

describe("request rate limits", () => {
  const fixedNow = Date.parse("2026-10-11T10:03:30.000Z");

  it("allows ten requests per requester in a window and stores nothing for the eleventh", async () => {
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const expiresAt = new Date(fixedNow + 3_600_000).toISOString();
    for (let index = 0; index < 10; index += 1) {
      expect(await request(`reader${index}@example.com`, { expiresAt })).toMatchObject({ status: "pending", shouldSend: true });
    }
    expect(await request("reader10@example.com", { expiresAt })).toEqual({
      subscriptionId: null,
      status: "rate_limited",
      shouldSend: false,
    });
    expect(await rows("SELECT id FROM newsletter_subscriptions")).toHaveLength(10);
    // Another requester is unaffected and the global counter only counted the accepted ones.
    expect(await request("other@example.com", { expiresAt, requestFingerprint: hex(8) })).toMatchObject({ shouldSend: true });
    expect(await rows("SELECT request_count FROM newsletter_subscription_request_limits WHERE scope_key = 'global'")).toEqual([
      { request_count: 11 },
    ]);

    // The next ten-minute window starts counting again.
    vi.spyOn(Date, "now").mockReturnValue(fixedNow + 600_000);
    expect(await request("reader10@example.com", { expiresAt: new Date(fixedNow + 4_200_000).toISOString() })).toMatchObject({
      shouldSend: true,
    });
  });

  it("limits the whole site to 200 requests a minute", async () => {
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    await run(
      "INSERT INTO newsletter_subscription_request_limits (scope_key, window_started_at, request_count, updated_at) VALUES ('global', '2026-10-11T10:03:00.000Z', 200, '2026-10-11T10:03:10.000Z')",
    );
    const expiresAt = new Date(fixedNow + 3_600_000).toISOString();
    expect(await request("busy@example.com", { expiresAt })).toMatchObject({ status: "rate_limited", shouldSend: false });
    expect(await rows("SELECT id FROM newsletter_subscriptions")).toEqual([]);

    vi.spyOn(Date, "now").mockReturnValue(fixedNow + 60_000);
    expect(await request("busy@example.com", { expiresAt: new Date(fixedNow + 3_660_000).toISOString() })).toMatchObject({
      shouldSend: true,
    });
  });

  it("forgets requesters that were last seen more than 30 days ago", async () => {
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    await run(
      "INSERT INTO newsletter_subscription_request_limits (scope_key, window_started_at, request_count, updated_at) VALUES (?1, '2026-08-01T00:00:00.000Z', 3, '2026-08-01T00:00:00.000Z')",
      hex(99),
    );
    await request("fresh@example.com", { expiresAt: new Date(fixedNow + 3_600_000).toISOString() });
    expect(await rows("SELECT scope_key FROM newsletter_subscription_request_limits ORDER BY scope_key")).toEqual([
      { scope_key: hex(3) },
      { scope_key: "global" },
    ]);
  });
});

describe("campaign drafts", () => {
  it("creates, edits and renders a draft, and refuses to edit anything that is no longer a draft", async () => {
    const draft = await repository.saveDraft(draftInput({ contentMarkdown: "# Title\n\n**Bold** text goes here." }), editor);
    expect(draft).toMatchObject({ status: "draft", subject: "Weekly digest", recipientCount: 0, replyTo: null });
    expect(draft.contentHtml).toContain("<strong>Bold</strong>");

    const edited = await repository.saveDraft(draftInput({ id: draft.id, subject: "Changed", replyTo: "reply@example.com" }), editor);
    expect(edited).toMatchObject({ id: draft.id, subject: "Changed", replyTo: "reply@example.com" });
    expect(edited.updatedAt >= draft.updatedAt).toBe(true);
    expect(await repository.getCampaign(draft.id)).toEqual(edited);
    expect(await repository.getCampaign(crypto.randomUUID())).toBeNull();

    await addSubscriber("one@example.com");
    await repository.queueCampaign(draft.id, null);
    await expect(repository.saveDraft(draftInput({ id: draft.id }), editor)).rejects.toThrow("Unable to update newsletter draft");
    await expect(repository.saveDraft(draftInput({ id: crypto.randomUUID() }), editor)).rejects.toThrow("Unable to update newsletter draft");
  });

  it("deletes a draft and nothing else: a queued, sent or unknown campaign stays", async () => {
    const draft = await repository.saveDraft(draftInput(), editor);
    const other = await repository.saveDraft(draftInput({ subject: "Another draft" }), editor);
    expect(await repository.deleteDraft(draft.id)).toBe(true);
    expect(await repository.getCampaign(draft.id)).toBeNull();
    expect(await repository.getCampaign(other.id)).not.toBeNull();
    expect(await repository.deleteDraft(draft.id)).toBe(false);
    expect(await repository.deleteDraft(crypto.randomUUID())).toBe(false);

    await addSubscriber("one@example.com");
    const queued = await repository.queueCampaign(other.id, null);
    expect(await repository.deleteDraft(other.id)).toBe(false);
    expect(await repository.getCampaign(other.id)).toEqual(queued);
    expect(await rows("SELECT id FROM newsletter_campaign_recipients WHERE campaign_id = ?", other.id)).toHaveLength(1);
  });

  it("lists campaigns of one locale, newest first, with the total", async () => {
    const first = await repository.saveDraft(draftInput({ subject: "First" }), editor);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await repository.saveDraft(draftInput({ subject: "Second" }), editor);
    await repository.saveDraft(draftInput({ locale: "it", audienceLocale: "it" }), editor);

    const page = await repository.listCampaigns({ locale: "en" });
    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.id)).toEqual([second.id, first.id]);
    expect((await repository.listCampaigns({ locale: "en", limit: 1, offset: 1 })).items.map((item) => item.id)).toEqual([first.id]);
  });
});

describe("queue and cancel", () => {
  it("snapshots the active subscribers of the audience locale into recipients and the outbox", async () => {
    await addSubscriber("a@example.com");
    await addSubscriber("b@example.com");
    await addSubscriber("c@example.com", { status: "pending" });
    await addSubscriber("d@example.com", { status: "unsubscribed" });
    await addSubscriber("e@example.com", { locale: "it" });
    const draft = await repository.saveDraft(draftInput(), editor);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const queued = await repository.queueCampaign(draft.id, null);
    expect(queued).toMatchObject({ status: "sending", recipientCount: 2, scheduledFor: null });
    expect(queued.startedAt).not.toBeNull();
    // The trigger that stands in for Postgres' set_updated_at ran.
    expect(queued.updatedAt > draft.updatedAt).toBe(true);
    expect((await repository.listRecipients(draft.id)).map((recipient) => recipient.email).sort()).toEqual(["a@example.com", "b@example.com"]);
    expect(await rows("SELECT status, available_at, idempotency_key FROM newsletter_outbox")).toHaveLength(2);
    const [{ idempotency_key: key }] = await rows<{ idempotency_key: string }>("SELECT idempotency_key FROM newsletter_outbox ORDER BY id LIMIT 1");
    expect(key).toMatch(new RegExp(`^newsletter:${draft.id}:[0-9a-f-]{36}$`));

    // Queueing again changes nothing; a later subscriber is not added to the snapshot.
    await addSubscriber("late@example.com");
    expect(await repository.queueCampaign(draft.id, null)).toEqual(queued);
    expect(await rows("SELECT id FROM newsletter_campaign_recipients")).toHaveLength(2);
  });

  it("refuses an empty audience, unfinished content and a past schedule without writing anything", async () => {
    const draft = await repository.saveDraft(draftInput(), editor);
    await expect(repository.queueCampaign(draft.id, null)).rejects.toThrow("Campaign audience is empty");
    expect((await repository.getCampaign(draft.id))?.status).toBe("draft");

    await addSubscriber("a@example.com");
    const short = await repository.saveDraft(draftInput({ contentMarkdown: "too short" }), editor);
    await expect(repository.queueCampaign(short.id, null)).rejects.toThrow("Campaign content is incomplete");
    await expect(repository.queueCampaign(draft.id, new Date(Date.now() - 1000).toISOString())).rejects.toThrow(
      "Scheduled delivery must be in the future",
    );
    await expect(repository.queueCampaign(crypto.randomUUID(), null)).rejects.toThrow("Newsletter campaign not found");
    expect(await rows("SELECT id FROM newsletter_campaign_recipients")).toEqual([]);
    expect(await rows("SELECT id FROM newsletter_outbox")).toEqual([]);
  });

  it("schedules a campaign for later and starts it when the claim finds it due", async () => {
    await addSubscriber("a@example.com");
    const draft = await repository.saveDraft(draftInput(), editor);
    const when = new Date(Date.now() + 3_600_000);
    // Offsets are normalised to UTC, and the same instant queued twice is a no-op.
    const scheduled = await repository.queueCampaign(draft.id, when.toISOString().replace("Z", "+00:00"));
    expect(scheduled).toMatchObject({ status: "scheduled", scheduledFor: when.toISOString(), startedAt: null, recipientCount: 1 });
    expect(await repository.queueCampaign(draft.id, when.toISOString())).toEqual(scheduled);
    await expect(repository.queueCampaign(draft.id, null)).rejects.toThrow("Only draft campaigns can be queued");

    expect(await claimAll()).toEqual([]);
    await run("UPDATE newsletter_campaigns SET scheduled_for = '2020-01-01T00:00:00.000Z'");
    await run("UPDATE newsletter_outbox SET available_at = '2020-01-01T00:00:00.000Z'");
    const claimed = await claimAll();
    expect(claimed).toHaveLength(1);
    expect((await repository.getCampaign(draft.id))?.status).toBe("sending");
  });

  it("cancels a sending campaign but leaves a delivery that may be in flight alone", async () => {
    const campaign = await sendingCampaign(3);
    const [first, second] = await claimAll(2);
    expect(await repository.startOutboxDelivery({ outboxId: first.outboxId, workerId: worker })).toBe(true);

    const cancelled = await repository.cancelCampaign(campaign.id);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelledAt).not.toBeNull();
    expect(await rows("SELECT id, status FROM newsletter_outbox ORDER BY id")).toEqual([
      { id: first.outboxId, status: "processing" },
      { id: second.outboxId, status: "cancelled" },
      { id: expect.any(Number), status: "cancelled" },
    ]);
    const statuses = (await repository.listRecipients(campaign.id)).map((recipient) => recipient.deliveryStatus);
    expect(statuses.filter((status) => status === "cancelled")).toHaveLength(2);
    expect(statuses.filter((status) => status === "sending")).toHaveLength(1);
    expect(await repository.cancelCampaign(campaign.id)).toEqual(cancelled);
    expect(await claimAll()).toEqual([]);
  });

  it("cancels a draft but not a finished campaign", async () => {
    const draft = await repository.saveDraft(draftInput(), editor);
    expect((await repository.cancelCampaign(draft.id)).status).toBe("cancelled");
    await expect(repository.cancelCampaign(crypto.randomUUID())).rejects.toThrow("Newsletter campaign not found");

    const campaign = await sendingCampaign(1);
    await sendAll();
    expect((await repository.getCampaign(campaign.id))?.status).toBe("sent");
    await expect(repository.cancelCampaign(campaign.id)).rejects.toThrow("Only draft, scheduled or sending campaigns can be cancelled");
  });
});

describe("outbox", () => {
  it("claims each delivery once, with the campaign content and the attempt number", async () => {
    const campaign = await sendingCampaign(4);
    const [first, second] = await Promise.all([claimAll(3), claimAll(3)]);
    const outboxIds = [...first, ...second].map((delivery) => delivery.outboxId);
    expect(new Set(outboxIds).size).toBe(4);
    expect(first.length + second.length).toBe(4);
    expect(first[0]).toMatchObject({
      campaignId: campaign.id,
      attempt: 1,
      locale: "en",
      subject: "Weekly digest",
      fromEmail: "news@example.com",
      replyTo: null,
      contentMarkdown: campaign.contentMarkdown,
    });
    expect(first[0].idempotencyKey).toBe(`newsletter:${campaign.id}:${first[0].recipientId}`);
    expect((await repository.listRecipients(campaign.id)).every((recipient) => recipient.deliveryStatus === "sending")).toBe(true);
    expect(await claimAll()).toEqual([]);
  });

  it("validates the claim parameters", async () => {
    await expect(repository.claimOutbox({ limit: 0, workerId: worker, leaseSeconds: 60 })).rejects.toThrow("Invalid newsletter batch size");
    await expect(repository.claimOutbox({ limit: 51, workerId: worker, leaseSeconds: 60 })).rejects.toThrow("Invalid newsletter batch size");
    await expect(repository.claimOutbox({ limit: 5, workerId: "short", leaseSeconds: 60 })).rejects.toThrow("Invalid newsletter worker id");
    await expect(repository.claimOutbox({ limit: 5, workerId: worker, leaseSeconds: 10 })).rejects.toThrow("Invalid newsletter lease");
  });

  it("hands an expired lease to another worker, but not once the provider may have been called", async () => {
    await sendingCampaign(2);
    const [first, second] = await claimAll();
    expect(await repository.startOutboxDelivery({ outboxId: second.outboxId, workerId: worker })).toBe(true);
    await run("UPDATE newsletter_outbox SET lease_expires_at = '2020-01-01T00:00:00.000Z'");

    const reclaimed = await repository.claimOutbox({ limit: 5, workerId: "worker-bbbbbbbb", leaseSeconds: 60 });
    expect(reclaimed.map((delivery) => delivery.outboxId)).toEqual([first.outboxId]);
    // The first worker lost its lease, so it can no longer start, finish or fail that delivery.
    expect(await repository.startOutboxDelivery({ outboxId: first.outboxId, workerId: worker })).toBe(false);
    expect(await repository.completeOutbox({ outboxId: first.outboxId, workerId: worker, providerMessageId: "x" })).toBe(false);
    expect(await repository.failOutbox({ outboxId: first.outboxId, workerId: worker, error: "x", retryable: true, retryAfterSeconds: 1 })).toBe(false);

    // The one that had started is dead rather than retried: its outcome is unknown.
    const [dead] = await rows<{ status: string; last_error: string }>("SELECT status, last_error FROM newsletter_outbox WHERE id = ?1", second.outboxId);
    expect(dead).toMatchObject({ status: "dead", last_error: expect.stringContaining("outcome is unknown") });
    const recipients = await repository.listRecipients((reclaimed[0]).campaignId);
    expect(recipients.find((recipient) => recipient.id === second.recipientId)).toMatchObject({ deliveryStatus: "failed" });
    expect((await repository.getCampaign(reclaimed[0].campaignId))?.failureCount).toBe(1);
  });

  it("starts a delivery once and completes it idempotently, then marks the drained campaign sent", async () => {
    const campaign = await sendingCampaign(1);
    const [delivery] = await claimAll();
    const outbox = { outboxId: delivery.outboxId, workerId: worker };

    // Completing before the provider call started is refused.
    expect(await repository.completeOutbox({ ...outbox, providerMessageId: "msg-1" })).toBe(false);
    expect(await repository.startOutboxDelivery({ outboxId: delivery.outboxId, workerId: "worker-bbbbbbbb" })).toBe(false);
    expect(await repository.startOutboxDelivery(outbox)).toBe(true);
    expect(await repository.startOutboxDelivery(outbox)).toBe(false);

    expect(await repository.completeOutbox({ ...outbox, providerMessageId: "msg-1" })).toBe(true);
    expect(await repository.completeOutbox({ ...outbox, providerMessageId: "msg-1" })).toBe(true);
    expect(await repository.completeOutbox({ ...outbox, providerMessageId: "msg-2" })).toBe(false);

    const [recipient] = await repository.listRecipients(campaign.id);
    expect(recipient).toMatchObject({ deliveryStatus: "sent", providerMessageId: "msg-1" });
    expect(recipient.sentAt).not.toBeNull();
    expect(await repository.getCampaign(campaign.id)).toMatchObject({ status: "sent", sentCount: 1, recipientCount: 1 });
    expect((await repository.getCampaign(campaign.id))?.sentAt).not.toBeNull();
  });

  it("retries a retryable failure later and gives up after the last attempt", async () => {
    const campaign = await sendingCampaign(1);
    const [delivery] = await claimAll();
    const outbox = { outboxId: delivery.outboxId, workerId: worker };
    await repository.startOutboxDelivery(outbox);
    expect(await repository.failOutbox({ ...outbox, error: "timeout", retryable: true, retryAfterSeconds: 3_600 })).toBe(true);

    const [retry] = await rows<{ status: string; available_at: string; last_error: string; worker_id: string | null }>(
      "SELECT status, available_at, last_error, worker_id FROM newsletter_outbox",
    );
    expect(retry).toMatchObject({ status: "retry", last_error: "timeout", worker_id: null });
    expect(Date.parse(retry.available_at)).toBeGreaterThan(Date.now() + 3_000_000);
    expect((await repository.listRecipients(campaign.id))[0].deliveryStatus).toBe("pending");
    expect(await claimAll()).toEqual([]);

    await run("UPDATE newsletter_outbox SET available_at = '2020-01-01T00:00:00.000Z', attempts = 4");
    const [again] = await claimAll();
    expect(again.attempt).toBe(5);
    await repository.startOutboxDelivery({ outboxId: again.outboxId, workerId: worker });
    expect(await repository.failOutbox({ outboxId: again.outboxId, workerId: worker, error: "timeout", retryable: true, retryAfterSeconds: 1 })).toBe(true);
    expect(await rows("SELECT status FROM newsletter_outbox")).toEqual([{ status: "dead" }]);
    expect(await repository.getCampaign(campaign.id)).toMatchObject({ status: "sent", failureCount: 1 });
  });

  it("does not deliver to a subscriber who unsubscribed before the provider call", async () => {
    const campaign = await sendingCampaign(2);
    const [first, second] = await claimAll();
    await run("UPDATE newsletter_subscriptions SET status = 'unsubscribed', confirmed_at = NULL WHERE email = (SELECT email FROM newsletter_campaign_recipients WHERE id = ?1)", first.recipientId);

    expect(await repository.startOutboxDelivery({ outboxId: first.outboxId, workerId: worker })).toBe(false);
    expect(await rows("SELECT status, last_error FROM newsletter_outbox WHERE id = ?1", first.outboxId)).toEqual([
      { status: "cancelled", last_error: expect.stringContaining("revoked") },
    ]);
    expect((await repository.listRecipients(campaign.id)).find((recipient) => recipient.id === first.recipientId)?.deliveryStatus).toBe("cancelled");
    expect(await repository.startOutboxDelivery({ outboxId: second.outboxId, workerId: worker })).toBe(true);
  });

  it("cancels a failed delivery instead of retrying it once the campaign was cancelled", async () => {
    const campaign = await sendingCampaign(1);
    const [delivery] = await claimAll();
    await repository.startOutboxDelivery({ outboxId: delivery.outboxId, workerId: worker });
    await repository.cancelCampaign(campaign.id);

    expect(await repository.failOutbox({ outboxId: delivery.outboxId, workerId: worker, error: "boom", retryable: true, retryAfterSeconds: 1 })).toBe(true);
    expect(await rows("SELECT status FROM newsletter_outbox")).toEqual([{ status: "cancelled" }]);
    expect((await repository.listRecipients(campaign.id))[0].deliveryStatus).toBe("cancelled");
  });
});

describe("provider events and suppressions", () => {
  const event = (webhookId: string, providerMessageId: string, type: string, occurredAt = "2026-10-11T10:00:00.000Z") => ({
    webhookId,
    providerMessageId,
    type,
    occurredAt,
    payload: { type, data: { to: ["reader0@example.com"], email_id: providerMessageId }, to: "reader0@example.com" },
  });

  it("records an event once and derives the recipient state and campaign counts from the events", async () => {
    const campaign = await sendingCampaign(1);
    const [delivery] = await sendAll();
    const message = `msg-${delivery.outboxId}`;

    expect(await repository.recordProviderEvent(event("w1", message, "email.delivered", "2026-10-11T10:00:00+00:00"))).toBe(true);
    expect(await repository.recordProviderEvent(event("w1", message, "email.delivered"))).toBe(false);
    expect(await repository.recordProviderEvent(event("w2", message, "email.opened", "2026-10-11T10:05:00.000Z"))).toBe(true);
    expect(await repository.recordProviderEvent(event("w3", message, "email.clicked", "2026-10-11T10:06:00.000Z"))).toBe(true);

    const [recipient] = await repository.listRecipients(campaign.id);
    expect(recipient).toMatchObject({
      deliveryStatus: "delivered",
      deliveredAt: "2026-10-11T10:00:00.000Z",
      openedAt: "2026-10-11T10:05:00.000Z",
      clickedAt: "2026-10-11T10:06:00.000Z",
    });
    expect(await repository.getCampaign(campaign.id)).toMatchObject({ deliveredCount: 1, sentCount: 1, openCount: 1, clickCount: 1 });
    expect(await rows("SELECT campaign_id, recipient_id FROM newsletter_delivery_events")).toEqual(
      Array(3).fill({ campaign_id: campaign.id, recipient_id: recipient.id }),
    );
  });

  it("keeps an event that arrives before its recipient is known and links it on completion", async () => {
    const campaign = await sendingCampaign(1);
    const [delivery] = await claimAll();
    await repository.startOutboxDelivery({ outboxId: delivery.outboxId, workerId: worker });
    expect(await repository.recordProviderEvent(event("early", "msg-early", "email.delivered"))).toBe(true);
    expect(await rows("SELECT recipient_id FROM newsletter_delivery_events")).toEqual([{ recipient_id: null }]);

    await repository.completeOutbox({ outboxId: delivery.outboxId, workerId: worker, providerMessageId: "msg-early" });
    expect((await repository.listRecipients(campaign.id))[0].deliveryStatus).toBe("delivered");
    expect(await repository.getCampaign(campaign.id)).toMatchObject({ deliveredCount: 1 });
  });

  it("suppresses the subscription when a message bounces, and registers the address for good", async () => {
    const campaign = await sendingCampaign(2);
    const [first, second] = await claimAll();
    for (const delivery of [first, second]) {
      await repository.startOutboxDelivery({ outboxId: delivery.outboxId, workerId: worker });
    }
    await repository.completeOutbox({ outboxId: first.outboxId, workerId: worker, providerMessageId: "msg-a" });
    await repository.recordProviderEvent(event("b1", "msg-a", "email.bounced"));

    expect(await rows("SELECT status, suppression_reason, confirmed_at FROM newsletter_subscriptions WHERE id = ?1", first.subscriptionId)).toEqual([
      { status: "suppressed", suppression_reason: "bounce", confirmed_at: null },
    ]);
    expect(await repository.getCampaign(campaign.id)).toMatchObject({ bounceCount: 1 });

    expect(await repository.registerSuppression({ providerMessageId: "unknown", emailHash: hex(20), reason: "bounce" })).toBe(false);
    expect(await repository.registerSuppression({ providerMessageId: "msg-a", emailHash: hex(20), reason: "complaint" })).toBe(true);
    expect(await rows("SELECT email_hash, reason FROM newsletter_suppressions")).toEqual([{ email_hash: hex(20), reason: "complaint" }]);
    expect(await request("reader0@example.com", { emailHash: hex(20) })).toMatchObject({ status: "suppressed", shouldSend: false });
    await expect(repository.registerSuppression({ providerMessageId: "msg-a", emailHash: "bad", reason: "bounce" })).rejects.toThrow(
      "Invalid newsletter suppression",
    );
  });

  it("cancels the queued mail of the other campaigns when an address is suppressed", async () => {
    const first = await sendingCampaign(1);
    const [delivery] = await claimAll();
    await repository.startOutboxDelivery({ outboxId: delivery.outboxId, workerId: worker });
    await repository.completeOutbox({ outboxId: delivery.outboxId, workerId: worker, providerMessageId: "msg-s" });
    const second = await repository.queueCampaign((await repository.saveDraft(draftInput({ subject: "Second" }), editor)).id, null);

    await repository.registerSuppression({ providerMessageId: "msg-s", emailHash: hex(21), reason: "complaint" });
    expect((await repository.listRecipients(second.id))[0].deliveryStatus).toBe("cancelled");
    expect(await rows("SELECT status FROM newsletter_outbox WHERE campaign_id = ?1", second.id)).toEqual([{ status: "cancelled" }]);
    expect((await repository.listRecipients(first.id))[0].deliveryStatus).toBe("sent");
    expect((await repository.getCampaign(second.id))?.status).toBe("sent");
  });
});

describe("unsubscribe and erasure", () => {
  it("unsubscribes through a recipient, cancels queued mail and recounts the campaign", async () => {
    const campaign = await sendingCampaign(2);
    const [recipient] = await repository.listRecipients(campaign.id);
    const [{ subscription_id: subscriptionId }] = await rows<{ subscription_id: string }>(
      "SELECT subscription_id FROM newsletter_campaign_recipients WHERE id = ?1",
      recipient.id,
    );

    expect(await repository.unsubscribe({ subscriptionId, recipientId: crypto.randomUUID() })).toBe(false);
    expect(await repository.unsubscribe({ subscriptionId, recipientId: recipient.id })).toBe(true);
    expect(await repository.unsubscribe({ subscriptionId, recipientId: recipient.id })).toBe(true);
    expect(await rows("SELECT status, confirmed_at FROM newsletter_subscriptions WHERE id = ?1", subscriptionId)).toEqual([
      { status: "unsubscribed", confirmed_at: null },
    ]);
    expect((await repository.listRecipients(campaign.id)).find((item) => item.id === recipient.id)?.deliveryStatus).toBe("cancelled");
    expect(await claimAll()).toHaveLength(1);
  });

  it("erases a subscriber: no address left in subscriptions, recipients or event payloads, and no way back", async () => {
    const campaign = await sendingCampaign(1);
    const [delivery] = await sendAll();
    await repository.recordProviderEvent({
      webhookId: "e1",
      providerMessageId: `msg-${delivery.outboxId}`,
      type: "email.delivered",
      occurredAt: "2026-10-11T10:00:00.000Z",
      payload: { to: "reader0@example.com", from: "news@example.com", data: { to: ["reader0@example.com"], email_id: "x" }, kept: 1 },
    });

    expect(await repository.eraseSubscription({ subscriptionId: crypto.randomUUID(), emailHash: hex(30) })).toBe(false);
    expect(await repository.eraseSubscription({ subscriptionId: delivery.subscriptionId, emailHash: hex(30) })).toBe(true);

    expect(await rows("SELECT email, source, status, suppression_reason FROM newsletter_subscriptions")).toEqual([
      { email: `erased+${delivery.subscriptionId}@invalid.local`, source: "erased", status: "suppressed", suppression_reason: "erasure" },
    ]);
    const [recipient] = await rows<{ email: string; subscription_id: string | null }>("SELECT email, subscription_id FROM newsletter_campaign_recipients");
    expect(recipient).toEqual({ email: `erased+${delivery.recipientId}@invalid.local`, subscription_id: null });
    const [{ payload }] = await rows<{ payload: string }>("SELECT payload FROM newsletter_delivery_events");
    expect(JSON.parse(payload)).toEqual({ data: { email_id: "x" }, kept: 1 });
    expect(await repository.getCampaign(campaign.id)).toMatchObject({ sentCount: 1, recipientCount: 1 });
    expect(await request("reader0@example.com", { emailHash: hex(30) })).toMatchObject({ status: "suppressed", shouldSend: false });
    expect(await repository.getSubscriptionEmail(delivery.subscriptionId)).toBe(`erased+${delivery.subscriptionId}@invalid.local`);
    await expect(repository.eraseSubscription({ subscriptionId: delivery.subscriptionId, emailHash: "nope" })).rejects.toThrow(
      "Invalid newsletter erasure hash",
    );
  });
});

describe("schema", () => {
  it("rejects a row that breaks a Postgres constraint", async () => {
    await expect(addSubscriber("no-at-sign")).rejects.toThrow();
    await expect(addSubscriber("two@@example.com")).rejects.toThrow();
    await expect(addSubscriber(" Padded@example.com")).rejects.toThrow();
    await expect(run("INSERT INTO newsletter_subscriptions (id, email, status) VALUES ('x', 'a@example.com', 'active')")).rejects.toThrow();
    await addSubscriber("dup@example.com");
    await expect(addSubscriber("dup@example.com")).rejects.toThrow();
    await expect(run("INSERT INTO newsletter_suppressions (email_hash, reason) VALUES ('ABC', 'bounce')")).rejects.toThrow();
  });
});
