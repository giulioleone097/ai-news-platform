import {
  assertBatchSize,
  batchLimit,
  EditorialRuleError,
  rejectRepeats,
  validateEach,
} from "../../editorial/domain/errors";
import type { SocialOutboxRepository } from "../domain/ports";
import type {
  EnqueueSocialPublicationInput,
  RequeueSocialPublicationInput,
  SocialOutboxJob,
  SocialOutboxQuery,
  UpdatePendingSocialPublicationInput,
} from "../domain/social-publication";
import { normalizeEnqueueInput, normalizePendingUpdate, normalizeRequeueInput } from "./validation";
import { SocialPublishingError } from "../domain/errors";

/** A job can still be edited or cancelled while it waits in the queue and the provider was never called. */
const isWaiting = (job: SocialOutboxJob) => job.status === "pending" && job.dispatchStartedAt === null;

export class SocialPublishingService {
  constructor(private readonly repository: SocialOutboxRepository) {}

  enqueue(input: EnqueueSocialPublicationInput) {
    return this.repository.enqueue(normalizeEnqueueInput(input));
  }

  requeue(input: RequeueSocialPublicationInput, confirm: boolean) {
    if (!confirm) throw new SocialPublishingError("Requeue requires confirmation.", "confirmation_required");
    return this.repository.requeue(normalizeRequeueInput(input));
  }

  /**
   * Edits a job that is still waiting in the queue. A job that is cancelled or failed goes back through
   * `requeue`, which also resets its attempts; one that was sent cannot change.
   */
  async updatePending(input: UpdatePendingSocialPublicationInput) {
    const current = await this.repository.getById(input.id?.trim());
    if (!current) throw new SocialPublishingError("Outbox job not found.", "not_found");
    if (!isWaiting(current)) {
      throw new SocialPublishingError(
        `Only a job that is pending and was never dispatched can be edited; this one is ${current.status}.`,
        "invalid_input",
      );
    }
    if (current.revision !== input.expectedRevision) {
      throw new SocialPublishingError("The job changed since it was read: read it again and retry.", "conflict");
    }
    return this.repository.updatePending(normalizePendingUpdate(current, input, new Date()));
  }

  getById(id: string) {
    return this.repository.getById(id.trim());
  }

  getByIdempotencyKey(idempotencyKey: string) {
    return this.repository.getByIdempotencyKey(idempotencyKey.trim());
  }

  list(query: SocialOutboxQuery = {}) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.min(Math.max(query.offset ?? 0, 0), 10_000);
    return this.repository.list({ ...query, limit, offset });
  }

  cancelPending(id: string, confirm: boolean) {
    if (!confirm) throw new SocialPublishingError("Cancellation requires confirmation.", "confirmation_required");
    return this.repository.cancelPending(id.trim());
  }

  /** Cancels several waiting jobs, all or nothing: a job that cannot be cancelled is reported by its position. */
  async cancelPendingMany(ids: string[], confirm: boolean) {
    if (!confirm) throw new SocialPublishingError("Cancellation requires confirmation.", "confirmation_required");
    assertBatchSize(ids.length, batchLimit, "job");
    rejectRepeats(ids, (id) => id.trim(), (id) => `The job "${id}" appears twice`);
    await validateEach(
      ids,
      async (id) => {
        const job = await this.repository.getById(id.trim());
        if (!job) throw new EditorialRuleError("Outbox job not found.");
        if (!isWaiting(job)) throw new EditorialRuleError(`Only a pending job can be cancelled; this one is ${job.status}.`);
      },
      (id) => id,
    );
    return this.repository.cancelPendingMany(ids.map((id) => id.trim()));
  }

  retryFailed(id: string, confirm: boolean) {
    if (!confirm) throw new SocialPublishingError("Retry requires confirmation.", "confirmation_required");
    return this.repository.retryFailed(id.trim());
  }
}
