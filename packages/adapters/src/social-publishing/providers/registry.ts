import { SocialPublishingConfigurationError } from "@atlasnews/core/social-publishing/domain/errors";
import type { SocialProviderRegistry } from "@atlasnews/core/social-publishing/domain/ports";
import type { SocialProvider, SocialProviderAdapter } from "@atlasnews/core/social-publishing/domain/social-publication";
import type {
  LinkedInProviderConfig,
  WhatsAppProviderConfig,
  XProviderConfig,
} from "./config";
import { LinkedInPostsAdapter } from "./linkedin";
import { WhatsAppCloudAdapter } from "./whatsapp";
import { XPostsAdapter } from "./x";

export interface SocialProviderRegistryConfig {
  linkedin?: LinkedInProviderConfig | null;
  x?: XProviderConfig | null;
  whatsapp?: WhatsAppProviderConfig | null;
}

export class ConfiguredSocialProviderRegistry implements SocialProviderRegistry {
  private readonly adapters = new Map<SocialProvider, SocialProviderAdapter>();

  constructor(private readonly config: SocialProviderRegistryConfig) {}

  get(provider: SocialProvider) {
    const existing = this.adapters.get(provider);
    if (existing) return existing;

    const config = this.config[provider];
    if (!config) throw new SocialPublishingConfigurationError(`${provider} publishing is not configured.`);
    const adapter = provider === "linkedin"
      ? new LinkedInPostsAdapter(config as LinkedInProviderConfig)
      : provider === "x"
        ? new XPostsAdapter(config as XProviderConfig)
        : new WhatsAppCloudAdapter(config as WhatsAppProviderConfig);
    this.adapters.set(provider, adapter);
    return adapter;
  }
}
