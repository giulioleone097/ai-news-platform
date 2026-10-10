import { getMcpEventsLimits, getPublicSiteUrl } from "../config/env";
import { createServiceSupabaseClient } from "../supabase/service";
import { getPublicEditorialRepositories } from "../editorial/container";

import { CallbackVerifier } from "@atlasnews/core/mcp-events/application/callback-verifier";
import { DeliveryDispatcher } from "@atlasnews/core/mcp-events/application/delivery-dispatcher";
import { EventEnqueuer } from "@atlasnews/core/mcp-events/application/event-enqueuer";
import { McpEventsWorker } from "@atlasnews/core/mcp-events/application/events-worker";
import { DefaultMcpEventsService } from "@atlasnews/core/mcp-events/application/mcp-events-service";
import { EditorialPublishedArticleSource } from "./published-article-source";
import { SafeHttpsWebhookClient } from "./safe-https-client";
import { SupabaseMcpEventsRepository } from "./supabase-repository";

function createRepository() {
  const client = createServiceSupabaseClient();
  return client ? new SupabaseMcpEventsRepository(client) : null;
}

/** Subscription use cases; null when service-role persistence is not configured. */
export function createMcpEventsPersistentService() {
  const repository = createRepository();
  if (!repository) return null;
  return new DefaultMcpEventsService(
    repository,
    new CallbackVerifier(new SafeHttpsWebhookClient()),
    undefined,
    getMcpEventsLimits(),
  );
}

/** Cron worker (enqueue, deliver, prune); null when service-role persistence is not configured. */
export function createMcpEventsWorker() {
  const repository = createRepository();
  if (!repository) return null;
  const client = new SafeHttpsWebhookClient();
  const articles = new EditorialPublishedArticleSource(getPublicEditorialRepositories().articles);
  return new McpEventsWorker(
    new EventEnqueuer(repository, articles, getPublicSiteUrl().toString()),
    new DeliveryDispatcher(repository, client),
    repository,
  );
}
