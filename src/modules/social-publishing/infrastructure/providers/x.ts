import { SocialProviderError } from "../../domain/errors";
import type {
  SocialProviderAdapter,
  SocialProviderContext,
  SocialPublishPayload,
} from "../../domain/social-publication";
import { composeProviderText } from "../../application/validation";
import type { XProviderConfig } from "./config";
import {
  createProviderTransport,
  isRecord,
  providerFetch,
  readProviderJson,
  throwProviderHttpError,
} from "./http";

const xPostIdPattern = /^[0-9]{1,20}$/;

export class XPostsAdapter implements SocialProviderAdapter {
  readonly provider = "x" as const;
  private readonly transport;

  constructor(config: XProviderConfig) {
    this.transport = createProviderTransport(config, "X user access token");
  }

  validate(payload: SocialPublishPayload) {
    const text = composeProviderText(payload);
    if (!text || Array.from(text).length > 280 || payload.recipient) {
      throw new SocialProviderError(this.provider, "x_invalid_payload", "Invalid X post.", false, false);
    }
  }

  async publish(payload: SocialPublishPayload, context: SocialProviderContext) {
    void context;
    this.validate(payload);
    const response = await providerFetch(this.provider, this.transport, "https://api.x.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.transport.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: composeProviderText(payload) }),
    });
    if (response.status !== 201) await throwProviderHttpError(this.provider, response);
    const body = await readProviderJson(response);
    const data = isRecord(body) && isRecord(body.data) ? body.data : null;
    const messageId = typeof data?.id === "string" ? data.id : "";
    if (!xPostIdPattern.test(messageId)) {
      throw new SocialProviderError(
        this.provider,
        "x_response_unknown",
        "X accepted the request without a valid post ID.",
        false,
        true,
      );
    }
    return {
      messageId,
      url: `https://x.com/i/web/status/${messageId}`,
      status: "published",
    };
  }
}
