import { SocialProviderError, SocialPublishingConfigurationError } from "../../domain/errors";
import type {
  SocialProviderAdapter,
  SocialProviderContext,
  SocialPublishPayload,
} from "../../domain/social-publication";
import { composeProviderText, normalizeRecipient } from "../../application/validation";
import type { WhatsAppProviderConfig } from "./config";
import {
  createProviderTransport,
  isRecord,
  providerFetch,
  readProviderJson,
  throwProviderHttpError,
} from "./http";

const phoneNumberIdPattern = /^[0-9]{5,32}$/;
const graphVersionPattern = /^v[0-9]{1,2}\.[0-9]$/;
const messageIdPattern = /^[A-Za-z0-9._:+/=-]{8,512}$/;

export class WhatsAppCloudAdapter implements SocialProviderAdapter {
  readonly provider = "whatsapp" as const;
  private readonly transport;
  private readonly endpoint: string;

  constructor(config: WhatsAppProviderConfig) {
    this.transport = createProviderTransport(config, "WhatsApp access token");
    const phoneNumberId = config.phoneNumberId?.trim();
    const apiVersion = config.apiVersion?.trim();
    if (!phoneNumberIdPattern.test(phoneNumberId) || !graphVersionPattern.test(apiVersion)) {
      throw new SocialPublishingConfigurationError("WhatsApp phone number or API version is not configured.");
    }
    this.endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  }

  validate(payload: SocialPublishPayload) {
    const text = composeProviderText(payload);
    if (!payload.recipient || !text || text.length > 4_096) {
      throw new SocialProviderError(this.provider, "whatsapp_invalid_payload", "Invalid WhatsApp message.", false, false);
    }
    normalizeRecipient(payload.recipient);
  }

  async publish(payload: SocialPublishPayload, context: SocialProviderContext) {
    this.validate(payload);
    const response = await providerFetch(this.provider, this.transport, this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.transport.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizeRecipient(payload.recipient!),
        type: "text",
        text: {
          preview_url: Boolean(payload.articleUrl),
          body: composeProviderText(payload),
        },
        biz_opaque_callback_data: context.idempotencyKey,
      }),
    });
    if (response.status !== 200) await throwProviderHttpError(this.provider, response);
    const body = await readProviderJson(response);
    const messages = isRecord(body) && Array.isArray(body.messages) ? body.messages : [];
    const first = isRecord(messages[0]) ? messages[0] : null;
    const messageId = typeof first?.id === "string" ? first.id : "";
    if (!messageIdPattern.test(messageId)) {
      throw new SocialProviderError(
        this.provider,
        "whatsapp_response_unknown",
        "WhatsApp accepted the request without a valid message ID.",
        false,
        true,
      );
    }
    return { messageId, url: null, status: "accepted" };
  }
}
