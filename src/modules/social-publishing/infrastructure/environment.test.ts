import { describe, expect, it } from "vitest";

import { SocialPublishingConfigurationError } from "../domain/errors";
import { readSocialProviderConfig, readWhatsAppWebhookConfig } from "./environment";

describe("social publishing environment mapper", () => {
  it("maps the central environment contract without defaults", () => {
    expect(readSocialProviderConfig({
      LINKEDIN_ACCESS_TOKEN: "linkedin-access-token-123456",
      LINKEDIN_AUTHOR_URN: "urn:li:organization:5515715",
      LINKEDIN_API_VERSION: "202606",
      X_USER_ACCESS_TOKEN: "x-user-access-token-123456",
      WHATSAPP_ACCESS_TOKEN: "whatsapp-access-token-123456",
      WHATSAPP_PHONE_NUMBER_ID: "106540352242922",
      WHATSAPP_API_VERSION: "v23.0",
    })).toEqual({
      linkedin: {
        accessToken: "linkedin-access-token-123456",
        authorUrn: "urn:li:organization:5515715",
        apiVersion: "202606",
      },
      x: { accessToken: "x-user-access-token-123456" },
      whatsapp: {
        accessToken: "whatsapp-access-token-123456",
        phoneNumberId: "106540352242922",
        apiVersion: "v23.0",
      },
    });
  });

  it("fails closed on partial provider configuration", () => {
    expect(() => readSocialProviderConfig({
      LINKEDIN_ACCESS_TOKEN: "linkedin-access-token-123456",
    })).toThrow(SocialPublishingConfigurationError);
  });

  it("requires both WhatsApp webhook secrets", () => {
    expect(() => readWhatsAppWebhookConfig({
      WHATSAPP_WEBHOOK_SECRET: "whatsapp-app-secret-1234567890",
    })).toThrow(SocialPublishingConfigurationError);
    expect(readWhatsAppWebhookConfig({
      WHATSAPP_WEBHOOK_SECRET: "whatsapp-app-secret-1234567890",
      WHATSAPP_VERIFY_TOKEN: "whatsapp-verify-token-123456",
    })).toEqual({
      appSecret: "whatsapp-app-secret-1234567890",
      verifyToken: "whatsapp-verify-token-123456",
    });
  });
});
