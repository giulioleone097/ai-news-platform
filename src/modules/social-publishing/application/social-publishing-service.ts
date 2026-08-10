import type { SocialOutboxRepository } from "../domain/ports";
import type {
  EnqueueSocialPublicationInput,
  RequeueSocialPublicationInput,
  SocialOutboxQuery,
} from "../domain/social-publication";
import { normalizeEnqueueInput, normalizeRequeueInput } from "./validation";
import { SocialPublishingError } from "../domain/errors";

export class SocialPublishingService {
  constructor(private readonly repository: SocialOutboxRepository) {}

  enqueue(input: EnqueueSocialPublicationInput) {
    return this.repository.enqueue(normalizeEnqueueInput(input));
  }

  requeue(input: RequeueSocialPublicationInput, confirm: boolean) {
    if (!confirm) throw new SocialPublishingError("Requeue requires confirmation.", "confirmation_required");
    return this.repository.requeue(normalizeRequeueInput(input));
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

  retryFailed(id: string, confirm: boolean) {
    if (!confirm) throw new SocialPublishingError("Retry requires confirmation.", "confirmation_required");
    return this.repository.retryFailed(id.trim());
  }
}
