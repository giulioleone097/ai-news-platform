import { createHash } from "node:crypto";

import { SocialPublishingError } from "../domain/errors";
import {
  socialProviders,
  type EnqueueSocialPublicationInput,
  type RequeueSocialPublicationInput,
  type SocialPublishPayload,
  type SocialProvider,
} from "../domain/social-publication";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9:._/-]{15,159}$/;
const recipientPattern = /^\+?[1-9][0-9]{6,14}$/;

function invalid(message: string): never {
  throw new SocialPublishingError(message, "invalid_input");
}

export function isSocialProvider(value: unknown): value is SocialProvider {
  return typeof value === "string" && socialProviders.includes(value as SocialProvider);
}

export function normalizeRecipient(value: string) {
  const recipient = value.trim();
  if (!recipientPattern.test(recipient)) {
    invalid("WhatsApp requires an explicit E.164 or wa_id recipient.");
  }
  return recipient.replace(/^\+/, "");
}

function normalizeArticleUrl(value: string | undefined) {
  if (!value?.trim()) return undefined;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return invalid("Article URL must be a valid HTTPS URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    return invalid("Article URL must be a public HTTPS URL.");
  }
  url.hash = "";
  return url.toString();
}

export function normalizeSocialPayload(
  provider: SocialProvider,
  payload: SocialPublishPayload,
): SocialPublishPayload {
  const text = payload.text?.trim();
  if (!text || text.length > 4_096) invalid("Social message must contain 1 to 4096 characters.");

  const articleUrl = normalizeArticleUrl(payload.articleUrl);
  if (provider === "whatsapp") {
    if (!payload.recipient) invalid("WhatsApp requires an explicit recipient for every job.");
    return { text, articleUrl, recipient: normalizeRecipient(payload.recipient) };
  }
  if (payload.recipient) invalid("Recipient is only valid for WhatsApp jobs.");
  return { text, articleUrl };
}

function defaultIdempotencyKey(publicationId: string, provider: SocialProvider) {
  const digest = createHash("sha256")
    .update(`${provider}:${publicationId}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `social:${provider}:${digest}`;
}

export function normalizeEnqueueInput(input: EnqueueSocialPublicationInput) {
  const publicationId = input.publicationId?.trim();
  if (!uuidPattern.test(publicationId)) invalid("Publication ID must be a UUID.");
  if (!isSocialProvider(input.provider)) invalid("Unsupported social provider.");

  const idempotencyKey = input.idempotencyKey?.trim()
    || defaultIdempotencyKey(publicationId, input.provider);
  if (!idempotencyPattern.test(idempotencyKey)) invalid("Invalid idempotency key.");

  const scheduledFor = input.scheduledFor?.trim() || null;
  if (scheduledFor && Number.isNaN(Date.parse(scheduledFor))) invalid("Invalid scheduled date.");
  const maxAttempts = input.maxAttempts ?? 5;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    invalid("Max attempts must be between 1 and 10.");
  }

  return {
    publicationId,
    provider: input.provider,
    payload: normalizeSocialPayload(input.provider, input.payload),
    idempotencyKey,
    scheduledFor,
    maxAttempts,
  };
}

export function normalizeRequeueInput(input: RequeueSocialPublicationInput) {
  const id = input.id?.trim();
  const expectedRevision = input.expectedRevision;
  if (!uuidPattern.test(id)) invalid("Outbox job ID must be a UUID.");
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    invalid("Expected job revision must be a non-negative integer.");
  }
  const normalized = normalizeEnqueueInput(input);
  return {
    id,
    expectedRevision,
    publicationId: normalized.publicationId,
    provider: normalized.provider,
    payload: normalized.payload,
    scheduledFor: normalized.scheduledFor,
    maxAttempts: normalized.maxAttempts,
  };
}

export function composeProviderText(payload: SocialPublishPayload) {
  const text = payload.text.trim();
  return payload.articleUrl && !text.includes(payload.articleUrl)
    ? `${text}\n\n${payload.articleUrl}`
    : text;
}
