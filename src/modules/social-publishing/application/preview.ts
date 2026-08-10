import type { SocialProviderRegistry } from "../domain/ports";
import type { EnqueueSocialPublicationInput } from "../domain/social-publication";
import { composeProviderText, normalizeEnqueueInput } from "./validation";

export function previewSocialPublication(
  input: EnqueueSocialPublicationInput,
  providers: SocialProviderRegistry,
) {
  const normalized = normalizeEnqueueInput(input);
  providers.get(normalized.provider).validate(normalized.payload);
  return {
    publicationId: normalized.publicationId,
    provider: normalized.provider,
    idempotencyKey: normalized.idempotencyKey,
    text: composeProviderText(normalized.payload),
    articleUrl: normalized.payload.articleUrl ?? null,
    recipient: normalized.payload.recipient ? "[redacted]" : null,
    scheduledFor: normalized.scheduledFor,
    maxAttempts: normalized.maxAttempts,
    valid: true as const,
  };
}
