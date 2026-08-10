import { SocialPublishingConfigurationError } from "../domain/errors";
import type { SocialProviderRegistryConfig } from "./providers/registry";

type Environment = Record<string, string | undefined>;

function optionalGroup(environment: Environment, keys: string[]) {
  const values = keys.map((key) => environment[key]?.trim() || null);
  if (values.every((value) => value === null)) return null;
  if (values.some((value) => value === null)) {
    throw new SocialPublishingConfigurationError(`Incomplete ${keys[0].split("_")[0]} configuration.`);
  }
  return values as string[];
}

export function readSocialProviderConfig(
  environment: Environment = process.env,
): SocialProviderRegistryConfig {
  const linkedin = optionalGroup(environment, [
    "LINKEDIN_ACCESS_TOKEN",
    "LINKEDIN_AUTHOR_URN",
    "LINKEDIN_API_VERSION",
  ]);
  const x = optionalGroup(environment, ["X_USER_ACCESS_TOKEN"]);
  const whatsapp = optionalGroup(environment, [
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_API_VERSION",
  ]);
  return {
    linkedin: linkedin ? {
      accessToken: linkedin[0],
      authorUrn: linkedin[1],
      apiVersion: linkedin[2],
    } : null,
    x: x ? { accessToken: x[0] } : null,
    whatsapp: whatsapp ? {
      accessToken: whatsapp[0],
      phoneNumberId: whatsapp[1],
      apiVersion: whatsapp[2],
    } : null,
  };
}

export function readWhatsAppWebhookConfig(environment: Environment = process.env) {
  const values = optionalGroup(environment, [
    "WHATSAPP_WEBHOOK_SECRET",
    "WHATSAPP_VERIFY_TOKEN",
  ]);
  if (!values || values[0].length < 20 || values[1].length < 16) {
    throw new SocialPublishingConfigurationError("WhatsApp webhook verification is not configured.");
  }
  return { appSecret: values[0], verifyToken: values[1] };
}
