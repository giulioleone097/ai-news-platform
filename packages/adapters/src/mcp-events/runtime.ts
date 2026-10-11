import { getContentMode, getMcpEventsLimits, getPublicSiteUrl } from "../config/env";
import { getSitesBindings } from "../sites/bindings";
import { createServiceSupabaseClient } from "../supabase/service";
import { getPublicEditorialRepositories } from "../editorial/container";

import { CallbackVerifier } from "@atlasnews/core/mcp-events/application/callback-verifier";
import { DeliveryDispatcher } from "@atlasnews/core/mcp-events/application/delivery-dispatcher";
import { EventEnqueuer } from "@atlasnews/core/mcp-events/application/event-enqueuer";
import { McpEventsWorker } from "@atlasnews/core/mcp-events/application/events-worker";
import { DefaultMcpEventsService } from "@atlasnews/core/mcp-events/application/mcp-events-service";
import type { McpEventsRepository, WebhookClient } from "@atlasnews/core/mcp-events/domain/ports";
import { D1McpEventsRepository } from "./d1-repository";
import { FetchHttpsWebhookClient } from "./fetch-https-client";
import { EditorialPublishedArticleSource } from "./published-article-source";
import { SafeHttpsWebhookClient } from "./safe-https-client";
import { SupabaseMcpEventsRepository } from "./supabase-repository";

/** The store and the outbound client that go with it; null when no server-side store is configured. */
function createBackend(): { repository: McpEventsRepository; client: WebhookClient } | null {
  if (getContentMode() === "sites") {
    // A Worker has its own fetch-based client; the Node one needs node:https and DNS pinning.
    const bindings = getSitesBindings();
    return bindings
      ? { repository: new D1McpEventsRepository(bindings.database), client: new FetchHttpsWebhookClient() }
      : null;
  }
  const supabase = createServiceSupabaseClient();
  return supabase
    ? { repository: new SupabaseMcpEventsRepository(supabase), client: new SafeHttpsWebhookClient() }
    : null;
}

/** Subscription use cases; null when no server-side store is configured. */
export function createMcpEventsPersistentService() {
  const backend = createBackend();
  if (!backend) return null;
  return new DefaultMcpEventsService(
    backend.repository,
    new CallbackVerifier(backend.client),
    undefined,
    getMcpEventsLimits(),
  );
}

/** Cron worker (enqueue, deliver, prune); null when no server-side store is configured. */
export function createMcpEventsWorker() {
  const backend = createBackend();
  if (!backend) return null;
  const { repository, client } = backend;
  const articles = new EditorialPublishedArticleSource(getPublicEditorialRepositories().articles);
  return new McpEventsWorker(
    new EventEnqueuer(repository, articles, getPublicSiteUrl().toString()),
    new DeliveryDispatcher(repository, client),
    repository,
  );
}
