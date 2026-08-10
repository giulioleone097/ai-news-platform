import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { SocialOutboxProcessor } from "../application/outbox-processor";
import { SocialPublishingService } from "../application/social-publishing-service";
import { SocialPublishingConfigurationError } from "../domain/errors";
import { readSocialProviderConfig, readWhatsAppWebhookConfig } from "./environment";
import { SupabaseSocialOutboxRepository } from "./supabase-social-outbox-repository";
import { ConfiguredSocialProviderRegistry } from "./providers/registry";

type Environment = Record<string, string | undefined>;

function createRepository() {
  const client = createServiceSupabaseClient();
  if (!client) throw new SocialPublishingConfigurationError("Social outbox persistence is not configured.");
  return new SupabaseSocialOutboxRepository(client);
}

export function createSocialPublishingRuntime(environment: Environment = process.env) {
  const repository = createRepository();
  const providers = new ConfiguredSocialProviderRegistry(readSocialProviderConfig(environment));
  return {
    repository,
    providers,
    service: new SocialPublishingService(repository),
    processor: new SocialOutboxProcessor(repository, providers),
  };
}

export function createWhatsAppWebhookRuntime(environment: Environment = process.env) {
  return {
    repository: createRepository(),
    config: readWhatsAppWebhookConfig(environment),
  };
}
