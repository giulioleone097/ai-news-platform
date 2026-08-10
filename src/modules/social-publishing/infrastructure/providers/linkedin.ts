import { SocialProviderError, SocialPublishingConfigurationError } from "../../domain/errors";
import type {
  SocialProviderAdapter,
  SocialProviderContext,
  SocialPublishPayload,
} from "../../domain/social-publication";
import { composeProviderText } from "../../application/validation";
import type { LinkedInProviderConfig } from "./config";
import {
  createProviderTransport,
  providerFetch,
  throwProviderHttpError,
} from "./http";

const authorPattern = /^urn:li:(?:person|organization):[A-Za-z0-9_-]{2,128}$/;
const versionPattern = /^[0-9]{6}$/;
const postIdPattern = /^urn:li:(?:share|ugcPost):[A-Za-z0-9_-]{2,160}$/;

export class LinkedInPostsAdapter implements SocialProviderAdapter {
  readonly provider = "linkedin" as const;
  private readonly transport;
  private readonly authorUrn: string;
  private readonly apiVersion: string;

  constructor(config: LinkedInProviderConfig) {
    this.transport = createProviderTransport(config, "LinkedIn access token");
    this.authorUrn = config.authorUrn?.trim();
    this.apiVersion = config.apiVersion?.trim();
    if (!authorPattern.test(this.authorUrn) || !versionPattern.test(this.apiVersion)) {
      throw new SocialPublishingConfigurationError("LinkedIn author or API version is not configured.");
    }
  }

  validate(payload: SocialPublishPayload) {
    const text = composeProviderText(payload);
    if (!text || text.length > 3_000 || payload.recipient) {
      throw new SocialProviderError(this.provider, "linkedin_invalid_payload", "Invalid LinkedIn post.", false, false);
    }
  }

  async publish(payload: SocialPublishPayload, context: SocialProviderContext) {
    void context;
    this.validate(payload);
    const response = await providerFetch(
      this.provider,
      this.transport,
      "https://api.linkedin.com/rest/posts",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.transport.accessToken}`,
          "Content-Type": "application/json",
          "Linkedin-Version": this.apiVersion,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          author: this.authorUrn,
          commentary: composeProviderText(payload),
          visibility: "PUBLIC",
          distribution: {
            feedDistribution: "MAIN_FEED",
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
        }),
      },
    );
    if (response.status !== 201) await throwProviderHttpError(this.provider, response);
    const messageId = response.headers.get("x-restli-id")?.trim() ?? "";
    if (!postIdPattern.test(messageId)) {
      throw new SocialProviderError(
        this.provider,
        "linkedin_response_unknown",
        "LinkedIn accepted the request without a valid post ID.",
        false,
        true,
      );
    }
    return {
      messageId,
      url: `https://www.linkedin.com/feed/update/${messageId}/`,
      status: "published",
    };
  }
}
