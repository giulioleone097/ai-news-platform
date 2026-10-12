import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { SocialPublishingError } from "@atlasnews/core/social-publishing/domain/errors";
import type { SocialProvider, SocialPublishPayload } from "@atlasnews/core/social-publishing/domain/social-publication";
import { createSitesTestStore, type SitesTestStore } from "../sites/testing";
import { D1SocialOutboxRepository } from "./d1-social-outbox-repository";

let store: SitesTestStore;
let repository: D1SocialOutboxRepository;
let counter = 0;

const minute = 60_000;
const past = () => new Date(Date.now() - minute).toISOString();
const future = (ms: number) => new Date(Date.now() + ms).toISOString();
const lease = { workerToken: "11111111-1111-4111-8111-111111111111", limit: 10, leaseSeconds: 60 };
const receipt = { messageId: "urn:li:share:1", url: "https://linkedin.example/post/1", status: "published" };

function run(sql: string, ...values: unknown[]) {
  return store.database.prepare(sql).bind(...values).run();
}

async function first<T>(sql: string, ...values: unknown[]) {
  return store.database.prepare(sql).bind(...values).first<T>();
}

/** A distribution publication of one article for the channel, as the editorial adapter creates them. */
async function publication(channel: SocialProvider = "linkedin") {
  counter += 1;
  const stamp = new Date().toISOString();
  const articleId = crypto.randomUUID();
  const id = crypto.randomUUID();
  await run(
    `INSERT INTO articles (id, translation_key, slug, title, excerpt, content, cover_alt, category_id, author_id, created_at, updated_at)
     VALUES (?, ?, ?, 'A model ships today', 'A short summary of the story.', 'The body of the story.', 'Cover', 'category-1', 'author-1', ?, ?)`,
    articleId, `story-${counter}`, `story-${counter}`, stamp, stamp,
  );
  await run(
    "INSERT INTO social_publications (id, article_id, channel, status, created_at, updated_at) VALUES (?, ?, ?, 'ready', ?, ?)",
    id, articleId, channel, stamp, stamp,
  );
  return id;
}

const publicationState = (id: string) =>
  first<{ status: string; external_url: string | null; published_at: string | null }>(
    "SELECT status, external_url, published_at FROM social_publications WHERE id = ?",
    id,
  );

function enqueueInput(publicationId: string, overrides: Record<string, unknown> = {}) {
  counter += 1;
  return {
    publicationId,
    provider: "linkedin" as SocialProvider,
    payload: { text: "A model ships", articleUrl: "https://atlasnews.example.com/en/articles/a-model-ships" } as SocialPublishPayload,
    idempotencyKey: `social:linkedin:${String(counter).padStart(16, "0")}`,
    scheduledFor: null,
    maxAttempts: 3,
    ...overrides,
  };
}

/** Enqueues a job and leases it, optionally marking the provider call as started. */
async function leased(options: { dispatch?: boolean; provider?: SocialProvider; maxAttempts?: number } = {}) {
  const provider = options.provider ?? "linkedin";
  const publicationId = await publication(provider);
  const payload = provider === "whatsapp" ? { text: "Hi", recipient: "15551234567" } : { text: "Hi" };
  const job = await repository.enqueue(enqueueInput(publicationId, { provider, payload, maxAttempts: options.maxAttempts ?? 3 }));
  const [claimed] = await repository.claim(lease);
  expect(claimed.id).toBe(job.id);
  if (options.dispatch) await repository.markDispatchStarted(job.id, lease.workerToken);
  return { job: claimed, publicationId };
}

const persistenceFailure = { name: "SocialPublishingError", code: "persistence_error" };
const fails = (promise: Promise<unknown>) => expect(promise).rejects.toMatchObject(persistenceFailure);

beforeAll(async () => {
  store = await createSitesTestStore();
  const stamp = new Date().toISOString();
  await run("INSERT INTO authors (id, name, initials) VALUES ('author-1', 'Ada Editor', 'AE')");
  await run(
    "INSERT INTO categories (id, translation_key, slug, name, created_at) VALUES ('category-1', 'models', 'models', 'Models', ?)",
    stamp,
  );
});
afterAll(() => store.dispose());
beforeEach(async () => {
  await run("DELETE FROM social_outbox");
  await run("DELETE FROM social_publications");
  repository = new D1SocialOutboxRepository(store.database);
});

describe("D1SocialOutboxRepository enqueue", () => {
  it("creates a pending job that is due now, with defaults", async () => {
    const publicationId = await publication();
    const job = await repository.enqueue(enqueueInput(publicationId));

    expect(job).toMatchObject({
      publicationId,
      provider: "linkedin",
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
      revision: 0,
      retrySafe: true,
      leaseToken: null,
      payload: { text: "A model ships", articleUrl: "https://atlasnews.example.com/en/articles/a-model-ships" },
    });
    expect(Date.parse(job.availableAt)).toBeLessThanOrEqual(Date.now());
    expect(await repository.getById(job.id)).toEqual(job);
    expect(await repository.getByIdempotencyKey(job.idempotencyKey)).toEqual(job);
    expect(await repository.getById("missing")).toBeNull();
  });

  it("replays an identical enqueue and rejects a reused key or publication with other content", async () => {
    const publicationId = await publication();
    const input = enqueueInput(publicationId);
    const job = await repository.enqueue(input);

    expect(await repository.enqueue({ ...input, payload: { ...input.payload } })).toEqual(job);
    await fails(repository.enqueue({ ...input, payload: { text: "Another text" } }));
    await fails(repository.enqueue({ ...input, idempotencyKey: `${input.idempotencyKey}-other` }));
    const otherPublication = await publication();
    await fails(repository.enqueue({ ...input, publicationId: otherPublication }));
    expect((await repository.list({ limit: 10, offset: 0 })).total).toBe(1);
  });

  it("requires an existing publication of the same channel", async () => {
    await fails(repository.enqueue(enqueueInput(crypto.randomUUID())));
    await fails(repository.enqueue(enqueueInput(await publication("x"))));
  });

  it("applies the payload rules of the Postgres function", async () => {
    const accepted = await repository.enqueue(enqueueInput(await publication("whatsapp"), {
      provider: "whatsapp",
      payload: { text: "Briefing", recipient: "15551234567" },
    }));
    expect(accepted.payload.recipient).toBe("15551234567");

    const linkedin = await publication();
    await fails(repository.enqueue(enqueueInput(linkedin, { payload: { text: "   " } })));
    await fails(repository.enqueue(enqueueInput(linkedin, { payload: { text: "x".repeat(4097) } })));
    await fails(repository.enqueue(enqueueInput(linkedin, { payload: { text: "Hi", articleUrl: "http://insecure.example.com" } })));
    await fails(repository.enqueue(enqueueInput(linkedin, { payload: { text: "Hi", recipient: "15551234567" } })));
    await fails(repository.enqueue(enqueueInput(await publication("whatsapp"), { provider: "whatsapp", payload: { text: "Hi" } })));
    await fails(repository.enqueue(enqueueInput(linkedin, { idempotencyKey: "too-short" })));
    await fails(repository.enqueue(enqueueInput(linkedin, { idempotencyKey: "social:linkedin:with space!" })));
    await fails(repository.enqueue(enqueueInput(linkedin, { maxAttempts: 11 })));
    await fails(repository.enqueue(enqueueInput(linkedin, { provider: "mastodon" })));
  });

  it("keeps the database constraints even for statements that skip the adapter", async () => {
    const publicationId = await publication();
    const insert = (key: string, status: string, leaseToken: string | null) => run(
      `INSERT INTO social_outbox (id, publication_id, provider, idempotency_key, payload, status, lease_token, lease_expires_at)
       VALUES (?, ?, 'linkedin', ?, '{"text":"Hi"}', ?, ?, ?)`,
      crypto.randomUUID(), publicationId, key, status, leaseToken, leaseToken ? future(minute) : null,
    );
    await expect(insert("social:linkedin:bad key!!!!", "pending", null)).rejects.toThrow();
    await expect(insert("social:linkedin:0000000000", "processing", null)).rejects.toThrow();
    await expect(insert("social:linkedin:0000000001", "pending", "token")).rejects.toThrow();
  });

  it("schedules a job for later and keeps it out of claims until then", async () => {
    const scheduledFor = future(10 * minute);
    const job = await repository.enqueue(enqueueInput(await publication(), { scheduledFor: new Date(scheduledFor).toUTCString() }));
    expect(job.availableAt).toBe(new Date(new Date(scheduledFor).toUTCString()).toISOString());
    expect(await repository.claim(lease)).toHaveLength(0);
  });

  it("deletes a job together with its publication", async () => {
    const publicationId = await publication();
    await repository.enqueue(enqueueInput(publicationId));
    await run("DELETE FROM social_publications WHERE id = ?", publicationId);
    expect((await repository.list({ limit: 10, offset: 0 })).total).toBe(0);
  });
});

describe("D1SocialOutboxRepository list", () => {
  it("pages newest first and filters by provider and status", async () => {
    const jobs = [];
    for (const provider of ["linkedin", "x", "linkedin"] as const) {
      jobs.push(await repository.enqueue(enqueueInput(await publication(provider), { provider })));
      await new Promise((resolve) => setTimeout(resolve, 3));
    }
    await repository.cancelPending(jobs[0].id);

    const page = await repository.list({ limit: 2, offset: 0 });
    expect(page).toMatchObject({ total: 3, limit: 2, offset: 0, hasMore: true });
    expect(page.items.map((job) => job.id)).toEqual([jobs[2].id, jobs[1].id]);
    expect((await repository.list({ limit: 2, offset: 2 })).items.map((job) => job.id)).toEqual([jobs[0].id]);
    expect((await repository.list({ limit: 10, offset: 0, provider: "x" })).items.map((job) => job.id)).toEqual([jobs[1].id]);
    expect((await repository.list({ limit: 10, offset: 0, status: "cancelled" })).total).toBe(1);
    expect((await repository.list({ limit: 10, offset: 0, provider: "x", status: "cancelled" })).items).toEqual([]);
  });
});

describe("D1SocialOutboxRepository claim and dispatch", () => {
  it("leases each due job to exactly one of two concurrent claims", async () => {
    for (let index = 0; index < 4; index += 1) await repository.enqueue(enqueueInput(await publication()));

    const [first, second] = await Promise.all([
      repository.claim({ ...lease, workerToken: "worker-a", limit: 3 }),
      repository.claim({ ...lease, workerToken: "worker-b", limit: 3 }),
    ]);

    const ids = [...first, ...second].map((job) => job.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const job of first) expect(job).toMatchObject({ status: "processing", attempts: 1, revision: 1, leaseToken: "worker-a" });
    for (const job of second) expect(job.leaseToken).toBe("worker-b");
    expect(Date.parse(first[0].leaseExpiresAt!)).toBeGreaterThan(Date.now() + 50_000);
  });

  it("claims oldest due first within the limit and rejects bounds outside 1..25 and 30..300 seconds", async () => {
    const a = await repository.enqueue(enqueueInput(await publication(), { scheduledFor: past() }));
    const b = await repository.enqueue(enqueueInput(await publication(), { scheduledFor: new Date(Date.now() - 2 * minute).toISOString() }));
    await repository.enqueue(enqueueInput(await publication()));
    expect((await repository.claim({ ...lease, limit: 2 })).map((job) => job.id)).toEqual([b.id, a.id]);

    for (const bounds of [{ limit: 0 }, { limit: 26 }, { leaseSeconds: 29 }, { leaseSeconds: 301 }]) {
      await fails(repository.claim({ ...lease, ...bounds }));
    }
  });

  it("starts a dispatch only under an active lease, and only once", async () => {
    const { job } = await leased();
    await fails(repository.markDispatchStarted(job.id, "someone-else"));
    await run("UPDATE social_outbox SET lease_expires_at = ? WHERE id = ?", past(), job.id);
    await fails(repository.markDispatchStarted(job.id, lease.workerToken));

    await run("UPDATE social_outbox SET lease_expires_at = ? WHERE id = ?", future(minute), job.id);
    const started = await repository.markDispatchStarted(job.id, lease.workerToken);
    expect(started.dispatchStartedAt).not.toBeNull();
    expect(started.revision).toBe(job.revision + 1);
    await fails(repository.markDispatchStarted(job.id, lease.workerToken));
  });

  it("reclaims a lapsed lease that never reached the provider", async () => {
    const { job } = await leased();
    await run("UPDATE social_outbox SET lease_expires_at = ? WHERE id = ?", past(), job.id);

    const [again] = await repository.claim({ ...lease, workerToken: "worker-b" });
    expect(again).toMatchObject({ id: job.id, attempts: 2, leaseToken: "worker-b" });
  });

  it("fails a lapsed lease whose provider call began: never re-sent, publication failed", async () => {
    const { job, publicationId } = await leased({ dispatch: true });
    await run("UPDATE social_outbox SET lease_expires_at = ? WHERE id = ?", past(), job.id);

    expect(await repository.claim(lease)).toHaveLength(0);
    expect(await repository.getById(job.id)).toMatchObject({
      status: "failed",
      retrySafe: false,
      lastErrorCode: "lease_expired_after_dispatch",
      leaseToken: null,
    });
    expect((await publicationState(publicationId))?.status).toBe("failed");
    await fails(repository.retryFailed(job.id));
  });

  it("fails a lapsed lease with no attempts left before dispatch, and allows a safe retry", async () => {
    const { job, publicationId } = await leased({ maxAttempts: 1 });
    await run("UPDATE social_outbox SET lease_expires_at = ? WHERE id = ?", past(), job.id);

    expect(await repository.claim(lease)).toHaveLength(0);
    expect(await repository.getById(job.id)).toMatchObject({
      status: "failed",
      retrySafe: true,
      lastErrorCode: "max_attempts_before_dispatch",
    });
    expect((await publicationState(publicationId))?.status).toBe("failed");

    const retried = await repository.retryFailed(job.id);
    expect(retried).toMatchObject({ status: "pending", attempts: 0, lastErrorCode: null, failedAt: null, retrySafe: true });
    expect((await publicationState(publicationId))?.status).toBe("ready");
  });
});

describe("D1SocialOutboxRepository outcomes", () => {
  it("records a receipt, publishes the publication and ends the lease", async () => {
    const { job, publicationId } = await leased({ dispatch: true });
    const sent = await repository.markSent(job.id, lease.workerToken, receipt);

    expect(sent).toMatchObject({
      status: "sent",
      providerMessageId: "urn:li:share:1",
      providerUrl: "https://linkedin.example/post/1",
      providerStatus: "published",
      retrySafe: false,
      leaseToken: null,
      leaseExpiresAt: null,
    });
    expect(sent.sentAt).not.toBeNull();
    expect(await publicationState(publicationId)).toMatchObject({
      status: "published",
      external_url: "https://linkedin.example/post/1",
    });
    expect((await publicationState(publicationId))?.published_at).not.toBeNull();
  });

  it("refuses a receipt without a started dispatch, from another worker or after the lease lapsed, changing nothing", async () => {
    const { job, publicationId } = await leased();
    await fails(repository.markSent(job.id, lease.workerToken, receipt));
    await repository.markDispatchStarted(job.id, lease.workerToken);
    await fails(repository.markSent(job.id, "someone-else", receipt));
    await fails(repository.markSent(job.id, lease.workerToken, { ...receipt, messageId: "  " }));
    await run("UPDATE social_outbox SET lease_expires_at = ? WHERE id = ?", past(), job.id);
    await fails(repository.markSent(job.id, lease.workerToken, receipt));

    expect((await repository.getById(job.id))?.status).toBe("processing");
    expect((await publicationState(publicationId))?.status).toBe("ready");
  });

  it("rejects a provider message id that another job already holds", async () => {
    const first = await leased({ dispatch: true });
    await repository.markSent(first.job.id, lease.workerToken, receipt);
    const second = await leased({ dispatch: true });

    await fails(repository.markSent(second.job.id, lease.workerToken, receipt));
    expect((await repository.getById(second.job.id))?.status).toBe("processing");
    expect((await publicationState(second.publicationId))?.status).toBe("ready");
  });

  it("schedules a retry, then fails the job and the publication once the attempts are spent", async () => {
    const { job, publicationId } = await leased({ maxAttempts: 2 });
    const availableAt = future(5 * minute);

    const retried = await repository.markRetry({
      id: job.id,
      workerToken: lease.workerToken,
      availableAt: new Date(availableAt).toUTCString(),
      errorCode: "rate_limited",
      errorMessage: "Slow down.",
    });
    expect(retried).toMatchObject({
      status: "pending",
      leaseToken: null,
      retrySafe: true,
      lastErrorCode: "rate_limited",
      lastErrorMessage: "Slow down.",
      availableAt: new Date(new Date(availableAt).toUTCString()).toISOString(),
    });
    expect((await publicationState(publicationId))?.status).toBe("ready");
    expect(await repository.claim(lease)).toHaveLength(0);

    await run("UPDATE social_outbox SET available_at = ? WHERE id = ?", past(), job.id);
    const [second] = await repository.claim(lease);
    expect(second.attempts).toBe(2);
    const exhausted = await repository.markRetry({
      id: job.id,
      workerToken: lease.workerToken,
      availableAt: availableAt,
      errorCode: "rate_limited",
      errorMessage: "x".repeat(500),
    });
    expect(exhausted.status).toBe("failed");
    expect(exhausted.failedAt).not.toBeNull();
    expect(exhausted.lastErrorMessage).toHaveLength(400);
    expect((await publicationState(publicationId))?.status).toBe("failed");
  });

  it("fails a job for good or retry-safe, and only a retry-safe failure can be retried", async () => {
    const unsafe = await leased({ dispatch: true });
    const failed = await repository.markFailed({
      id: unsafe.job.id,
      workerToken: lease.workerToken,
      errorCode: "outcome_unknown",
      errorMessage: "Timed out after sending.",
      retrySafe: false,
    });
    expect(failed).toMatchObject({ status: "failed", retrySafe: false, lastErrorCode: "outcome_unknown", leaseToken: null });
    expect((await publicationState(unsafe.publicationId))?.status).toBe("failed");
    await fails(repository.retryFailed(unsafe.job.id));

    const safe = await leased();
    await repository.markFailed({
      id: safe.job.id,
      workerToken: lease.workerToken,
      errorCode: "invalid_credentials",
      errorMessage: "Rejected.",
      retrySafe: true,
    });
    const retried = await repository.retryFailed(safe.job.id);
    expect(retried).toMatchObject({ status: "pending", attempts: 0, retrySafe: true, lastErrorCode: null });
    expect(retried.revision).toBe(safe.job.revision + 2);
    expect((await publicationState(safe.publicationId))?.status).toBe("ready");
    await fails(repository.retryFailed(safe.job.id));
  });

  it("does not touch the publication when the lease no longer holds", async () => {
    const { job, publicationId } = await leased();
    await fails(repository.markFailed({ id: job.id, workerToken: "someone-else", errorCode: "x", errorMessage: "y", retrySafe: true }));
    await fails(repository.markRetry({
      id: job.id,
      workerToken: "someone-else",
      availableAt: future(minute),
      errorCode: "x",
      errorMessage: "y",
    }));
    expect((await publicationState(publicationId))?.status).toBe("ready");
    expect((await repository.getById(job.id))?.revision).toBe(job.revision);
  });
});

describe("D1SocialOutboxRepository cancel and requeue", () => {
  it("cancels only pending jobs and returns the publication to draft", async () => {
    const publicationId = await publication();
    const job = await repository.enqueue(enqueueInput(publicationId));

    const cancelled = await repository.cancelPending(job.id);
    expect(cancelled).toMatchObject({ status: "cancelled", retrySafe: false, revision: 1 });
    expect((await publicationState(publicationId))?.status).toBe("draft");
    await fails(repository.cancelPending(job.id));

    const { job: processing, publicationId: processingPublication } = await leased();
    await fails(repository.cancelPending(processing.id));
    expect((await publicationState(processingPublication))?.status).toBe("ready");
  });

  it("edits a waiting job in one statement: new payload, send time and attempt limit, one revision up, same key", async () => {
    const publicationId = await publication();
    const job = await repository.enqueue(enqueueInput(publicationId));
    const edit = (overrides: Record<string, unknown> = {}) => ({
      id: job.id,
      expectedRevision: job.revision,
      provider: "linkedin" as const,
      payload: { text: "A corrected post" } as SocialPublishPayload,
      availableAt: future(2 * minute),
      maxAttempts: 4,
      ...overrides,
    });

    const request = edit();
    const edited = await repository.updatePending(request);
    expect(edited).toMatchObject({
      id: job.id,
      status: "pending",
      payload: { text: "A corrected post" },
      maxAttempts: 4,
      availableAt: request.availableAt,
      revision: job.revision + 1,
      attempts: 0,
      idempotencyKey: job.idempotencyKey,
    });
    expect((await publicationState(publicationId))?.status).toBe("ready");
    expect(await repository.claim(lease)).toEqual([]);

    // The revision it was read at is spent, a payload that breaks the provider's rules never reaches the row.
    await fails(repository.updatePending(request));
    await fails(repository.updatePending(edit({ expectedRevision: edited.revision, provider: "x" })));
    await expect(repository.updatePending(edit({ expectedRevision: edited.revision, maxAttempts: 11 }))).rejects.toBeInstanceOf(SocialPublishingError);
    await expect(repository.updatePending(edit({ expectedRevision: edited.revision, payload: { text: "Hi", recipient: "15551234567" } }))).rejects.toBeInstanceOf(SocialPublishingError);
    expect(await repository.getById(job.id)).toEqual(edited);
  });

  it("does not edit a job that was claimed, dispatched or cancelled since it was read", async () => {
    const edit = (job: { id: string; revision: number }) => ({
      id: job.id,
      expectedRevision: job.revision,
      provider: "linkedin" as const,
      payload: { text: "Too late" } as SocialPublishPayload,
      availableAt: past(),
      maxAttempts: 3,
    });
    const { job: claimed } = await leased();
    await fails(repository.updatePending(edit(claimed)));
    const { job: dispatched } = await leased({ dispatch: true });
    await fails(repository.updatePending(edit(dispatched)));
    const waiting = await repository.enqueue(enqueueInput(await publication()));
    const cancelled = await repository.cancelPending(waiting.id);
    await fails(repository.updatePending(edit(cancelled)));
    expect((await repository.getById(claimed.id))?.payload).toEqual({ text: "Hi" });
  });

  it("cancels several waiting jobs together and returns every publication to draft", async () => {
    const publications = [await publication(), await publication("x"), await publication()];
    const jobs = [];
    for (const [index, publicationId] of publications.entries()) {
      jobs.push(await repository.enqueue(enqueueInput(publicationId, { provider: index === 1 ? "x" : "linkedin" })));
    }
    const bystander = await repository.enqueue(enqueueInput(await publication()));

    const cancelled = await repository.cancelPendingMany(jobs.map((job) => job.id));
    expect(cancelled.map((job) => job.id)).toEqual(jobs.map((job) => job.id));
    expect(cancelled.every((job) => job.status === "cancelled" && job.retrySafe === false && job.revision === 1)).toBe(true);
    for (const publicationId of publications) expect((await publicationState(publicationId))?.status).toBe("draft");
    expect((await repository.getById(bystander.id))?.status).toBe("pending");
  });

  it("cancels none when one job was claimed since it was checked: no status, no revision, no publication change", async () => {
    const { job: claimed, publicationId: claimedPublication } = await leased();
    const waiting = await repository.enqueue(enqueueInput(await publication()));
    const waitingBefore = await repository.getById(waiting.id);

    await fails(repository.cancelPendingMany([waiting.id, claimed.id]));
    await fails(repository.cancelPendingMany([waiting.id, crypto.randomUUID()]));
    await fails(repository.cancelPendingMany([waiting.id, waiting.id]));

    expect(await repository.getById(waiting.id)).toEqual(waitingBefore);
    expect((await repository.getById(claimed.id))?.status).toBe("processing");
    expect((await publicationState(claimedPublication))?.status).toBe("ready");
  });

  it("requeues a cancelled job with new content, and replays the same requeue without a second change", async () => {
    const publicationId = await publication();
    const job = await repository.enqueue(enqueueInput(publicationId));
    const cancelled = await repository.cancelPending(job.id);
    const request = {
      id: job.id,
      expectedRevision: cancelled.revision,
      publicationId,
      provider: "linkedin" as const,
      payload: { text: "Rewritten" },
      scheduledFor: null,
      maxAttempts: 4,
    };

    const requeued = await repository.requeue(request);
    expect(requeued).toMatchObject({
      status: "pending",
      attempts: 0,
      maxAttempts: 4,
      payload: { text: "Rewritten" },
      revision: cancelled.revision + 1,
      retrySafe: true,
      idempotencyKey: job.idempotencyKey,
    });
    expect((await publicationState(publicationId))?.status).toBe("ready");

    expect(await repository.requeue(request)).toEqual(requeued);
    await fails(repository.requeue({ ...request, payload: { text: "Different" } }));
    await fails(repository.requeue({ ...request, expectedRevision: 0 }));
  });

  it("requeues a retry-safe failure but never an unsafe one or one for another publication", async () => {
    const request = (job: { id: string; revision: number }, publicationId: string) => ({
      id: job.id,
      expectedRevision: job.revision,
      publicationId,
      provider: "linkedin" as const,
      payload: { text: "Again" },
      scheduledFor: null,
      maxAttempts: 3,
    });

    const unsafe = await leased({ dispatch: true });
    const failedUnsafe = await repository.markFailed({
      id: unsafe.job.id,
      workerToken: lease.workerToken,
      errorCode: "x",
      errorMessage: "y",
      retrySafe: false,
    });
    await fails(repository.requeue(request(failedUnsafe, unsafe.publicationId)));

    const safe = await leased();
    const failedSafe = await repository.markFailed({
      id: safe.job.id,
      workerToken: lease.workerToken,
      errorCode: "x",
      errorMessage: "y",
      retrySafe: true,
    });
    await fails(repository.requeue(request(failedSafe, await publication())));
    expect((await repository.requeue(request(failedSafe, safe.publicationId))).status).toBe("pending");
  });
});

describe("D1SocialOutboxRepository provider status", () => {
  async function sentWhatsApp() {
    const { job, publicationId } = await leased({ provider: "whatsapp", dispatch: true });
    await repository.markSent(job.id, lease.workerToken, { messageId: "wamid.1", url: null, status: "accepted" });
    return { job, publicationId };
  }
  const status = (overrides: Record<string, unknown>) => ({
    provider: "whatsapp" as const,
    providerMessageId: "wamid.1",
    status: "delivered" as const,
    occurredAt: "2026-08-10T08:00:00.000Z",
    ...overrides,
  });

  it("moves forward through delivered and read, ignoring older or lower-ranked updates", async () => {
    const { job, publicationId } = await sentWhatsApp();

    const delivered = await repository.applyProviderStatus(status({}));
    expect(delivered).toMatchObject({
      id: job.id,
      status: "sent",
      providerStatus: "delivered",
      providerStatusAt: "2026-08-10T08:00:00.000Z",
      deliveredAt: "2026-08-10T08:00:00.000Z",
      readAt: null,
    });
    expect(await repository.applyProviderStatus(status({ status: "sent", occurredAt: "2026-08-10T08:05:00.000Z" }))).toBeNull();
    expect(await repository.applyProviderStatus(status({ occurredAt: "2026-08-10T07:00:00.000Z" }))).toBeNull();

    const read = await repository.applyProviderStatus(status({ status: "read", occurredAt: "2026-08-10T08:10:00.000Z" }));
    expect(read).toMatchObject({
      providerStatus: "read",
      deliveredAt: "2026-08-10T08:00:00.000Z",
      readAt: "2026-08-10T08:10:00.000Z",
      revision: delivered!.revision + 1,
    });
    expect((await publicationState(publicationId))?.status).toBe("published");
  });

  it("marks the job and publication failed on a failed status and records the error", async () => {
    const { job, publicationId } = await sentWhatsApp();

    const failed = await repository.applyProviderStatus(status({
      status: "failed",
      errorCode: "131026",
      errorMessage: "Message undeliverable",
    }));
    expect(failed).toMatchObject({
      id: job.id,
      status: "failed",
      retrySafe: false,
      lastErrorCode: "131026",
      lastErrorMessage: "Message undeliverable",
      failedAt: "2026-08-10T08:00:00.000Z",
    });
    expect((await publicationState(publicationId))?.status).toBe("failed");

    const recovered = await repository.applyProviderStatus(status({ status: "delivered", occurredAt: "2026-08-10T09:00:00.000Z" }));
    expect(recovered).toMatchObject({ status: "sent", failedAt: null, lastErrorCode: null, retrySafe: false });
    expect((await publicationState(publicationId))?.status).toBe("published");
  });

  it("returns null for unknown messages and rejects invalid input", async () => {
    await sentWhatsApp();
    expect(await repository.applyProviderStatus(status({ providerMessageId: "wamid.unknown" }))).toBeNull();
    await fails(repository.applyProviderStatus(status({ provider: "x" })));
    await fails(repository.applyProviderStatus(status({ status: "queued" })));
    await fails(repository.applyProviderStatus(status({ providerMessageId: " " })));
    await fails(repository.applyProviderStatus(status({ occurredAt: "yesterday" })));
  });

  it("does not apply a status to a job that was never sent", async () => {
    const { job } = await leased({ provider: "whatsapp", dispatch: true });
    await run("UPDATE social_outbox SET provider_message_id = 'wamid.1' WHERE id = ?", job.id);
    expect(await repository.applyProviderStatus(status({}))).toBeNull();
  });
});

describe("D1SocialOutboxRepository errors", () => {
  it("raises the domain persistence error", async () => {
    const error = await repository.cancelPending("missing").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SocialPublishingError);
    expect(error).toMatchObject({ code: "persistence_error", message: "Social outbox persistence failed." });
  });
});
