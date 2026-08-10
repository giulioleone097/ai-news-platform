import { randomUUID } from "node:crypto";

import { SocialProviderError } from "../domain/errors";
import type { SocialOutboxRepository, SocialProviderRegistry } from "../domain/ports";
import type { SocialOutboxJob } from "../domain/social-publication";
import { nextRetryAt } from "./backoff";
import { redactProviderError, safeProviderCode } from "./error-redaction";

export interface SocialOutboxProcessResult {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  unresolved: number;
}

export class SocialOutboxProcessor {
  constructor(
    private readonly repository: SocialOutboxRepository,
    private readonly providers: SocialProviderRegistry,
  ) {}

  async processBatch(input: { limit?: number; leaseSeconds?: number } = {}) {
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
    const leaseSeconds = Math.min(Math.max(input.leaseSeconds ?? 90, 30), 300);
    const workerToken = randomUUID();
    const jobs = await this.repository.claim({ workerToken, limit, leaseSeconds });
    const result: SocialOutboxProcessResult = {
      claimed: jobs.length,
      sent: 0,
      retried: 0,
      failed: 0,
      unresolved: 0,
    };

    for (const job of jobs) await this.processJob(job, workerToken, result);
    return result;
  }

  private async processJob(
    job: SocialOutboxJob,
    workerToken: string,
    result: SocialOutboxProcessResult,
  ) {
    let dispatchStarted = false;
    let providerAccepted = false;
    try {
      const provider = this.providers.get(job.provider);
      provider.validate(job.payload);
      await this.repository.markDispatchStarted(job.id, workerToken);
      dispatchStarted = true;
      const providerResult = await provider.publish(job.payload, {
        idempotencyKey: job.idempotencyKey,
      });
      providerAccepted = true;
      const persisted = await this.repository.markSent(job.id, workerToken, providerResult);
      if (persisted.status !== "sent" || persisted.providerMessageId !== providerResult.messageId) {
        throw new Error("Provider acceptance was not persisted.");
      }
      result.sent += 1;
    } catch (error) {
      if (providerAccepted) {
        // Never dispatch again after provider acceptance when persistence is uncertain.
        result.unresolved += 1;
        return;
      }

      const providerError = error instanceof SocialProviderError ? error : null;
      const retryable = providerError?.retryable === true && providerError.outcomeUnknown === false;
      const retrySafe = dispatchStarted
        ? providerError?.outcomeUnknown === false
        : true;
      const errorCode = safeProviderCode(
        providerError?.code,
        dispatchStarted ? "provider_outcome_unknown" : "publisher_unavailable",
      );
      const errorMessage = redactProviderError(error);

      try {
        if (retryable && job.attempts < job.maxAttempts) {
          const persisted = await this.repository.markRetry({
            id: job.id,
            workerToken,
            availableAt: nextRetryAt({
              attempt: job.attempts,
              idempotencyKey: job.idempotencyKey,
              retryAfterSeconds: providerError?.retryAfterSeconds,
            }),
            errorCode,
            errorMessage,
          });
          if (persisted.status !== "pending") throw new Error("Outbox retry was not persisted.");
          result.retried += 1;
          return;
        }

        const persisted = await this.repository.markFailed({
          id: job.id,
          workerToken,
          errorCode,
          errorMessage,
          retrySafe,
        });
        if (persisted.status !== "failed") throw new Error("Outbox failure was not persisted.");
        result.failed += 1;
      } catch {
        result.unresolved += 1;
      }
    }
  }
}
