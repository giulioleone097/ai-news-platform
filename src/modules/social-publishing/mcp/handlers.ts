import type { SocialOutboxProcessor } from "../application/outbox-processor";
import { previewSocialPublication } from "../application/preview";
import type { SocialPublishingService } from "../application/social-publishing-service";
import { SocialPublishingError } from "../domain/errors";
import type { SocialProviderRegistry } from "../domain/ports";
import {
  publicSocialOutboxJob,
  socialOutboxStatuses,
  type EnqueueSocialPublicationInput,
  type SocialOutboxQuery,
  type SocialPublishPayload,
} from "../domain/social-publication";
import { isSocialProvider } from "../application/validation";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SocialPublishingError("Tool input must be an object.", "invalid_input");
  }
  return value as JsonObject;
}

function text(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw new SocialPublishingError(`${field} must be a string.`, "invalid_input");
  }
  return value;
}

function optionalText(value: unknown, field: string) {
  return value === undefined || value === null ? undefined : text(value, field);
}

function integer(value: unknown, fallback: number | undefined) {
  return value === undefined ? fallback : typeof value === "number" && Number.isInteger(value)
    ? value
    : Number.NaN;
}

function confirmed(input: JsonObject) {
  if (input.confirm !== true) {
    throw new SocialPublishingError("Explicit confirmation is required.", "confirmation_required");
  }
}

function enqueueInput(value: unknown): EnqueueSocialPublicationInput {
  const input = object(value);
  const provider = input.provider;
  if (!isSocialProvider(provider)) {
    throw new SocialPublishingError("Unsupported social provider.", "invalid_input");
  }
  const payloadInput = object(input.payload);
  const payload: SocialPublishPayload = {
    text: text(payloadInput.text, "payload.text"),
    articleUrl: optionalText(payloadInput.articleUrl, "payload.articleUrl"),
    recipient: optionalText(payloadInput.recipient, "payload.recipient"),
  };
  return {
    publicationId: text(input.publicationId, "publicationId"),
    provider,
    payload,
    idempotencyKey: optionalText(input.idempotencyKey, "idempotencyKey"),
    scheduledFor: optionalText(input.scheduledFor, "scheduledFor"),
    maxAttempts: integer(input.maxAttempts, undefined),
  };
}

export function createSocialPublishingMcpHandlers(input: {
  service: SocialPublishingService;
  processor: SocialOutboxProcessor;
  providers: SocialProviderRegistry;
}) {
  return {
    social_outbox_preview: async (value: unknown) => previewSocialPublication(
      enqueueInput(value),
      input.providers,
    ),
    social_outbox_enqueue: async (value: unknown) => {
      const request = object(value);
      confirmed(request);
      return publicSocialOutboxJob(await input.service.enqueue(enqueueInput(request)));
    },
    social_outbox_requeue: async (value: unknown) => {
      const request = object(value);
      confirmed(request);
      return publicSocialOutboxJob(await input.service.requeue({
        ...enqueueInput(request),
        id: text(request.id, "id"),
        expectedRevision: integer(request.expectedRevision, undefined)!,
      }, true));
    },
    social_outbox_list: async (value: unknown) => {
      const request = object(value ?? {});
      const query: SocialOutboxQuery = {
        limit: integer(request.limit, undefined),
        offset: integer(request.offset, undefined),
      };
      if (request.provider !== undefined) {
        if (!isSocialProvider(request.provider)) throw new SocialPublishingError("Invalid provider.", "invalid_input");
        query.provider = request.provider;
      }
      if (request.status !== undefined) {
        if (typeof request.status !== "string" || !socialOutboxStatuses.includes(request.status as never)) {
          throw new SocialPublishingError("Invalid outbox status.", "invalid_input");
        }
        query.status = request.status as SocialOutboxQuery["status"];
      }
      const page = await input.service.list(query);
      return { ...page, items: page.items.map(publicSocialOutboxJob) };
    },
    social_outbox_get: async (value: unknown) => {
      const request = object(value);
      const id = optionalText(request.id, "id");
      const idempotencyKey = optionalText(request.idempotencyKey, "idempotencyKey");
      if (Boolean(id) === Boolean(idempotencyKey)) {
        throw new SocialPublishingError("Provide exactly one job ID or idempotency key.", "invalid_input");
      }
      const job = id
        ? await input.service.getById(id)
        : await input.service.getByIdempotencyKey(idempotencyKey!);
      return job ? publicSocialOutboxJob(job) : null;
    },
    social_outbox_cancel: async (value: unknown) => {
      const request = object(value);
      confirmed(request);
      return publicSocialOutboxJob(await input.service.cancelPending(text(request.id, "id"), true));
    },
    social_outbox_retry: async (value: unknown) => {
      const request = object(value);
      confirmed(request);
      return publicSocialOutboxJob(await input.service.retryFailed(text(request.id, "id"), true));
    },
    social_outbox_process: async (value: unknown) => {
      const request = object(value);
      confirmed(request);
      return input.processor.processBatch();
    },
  };
}

export type SocialPublishingMcpHandlers = ReturnType<typeof createSocialPublishingMcpHandlers>;
