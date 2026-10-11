import { createSitesTestStore } from "../sites/testing";
import type { McpEventsRepository } from "@atlasnews/core/mcp-events/domain/ports";
import type { EventSubscription } from "@atlasnews/core/mcp-events/domain/subscription";
import type { McpWebhookEvent } from "@atlasnews/core/mcp-events/domain/events";
import { D1McpEventsRepository } from "./d1-repository";
import { MemoryMcpEventsRepository } from "./memory-repository";

// Test support: the McpEventsRepository implementations that the service and worker tests run against,
// each with a way to read and nudge stored state that the port itself does not expose.

export interface DeliveryView {
  subscriptionId: string;
  articleId: string;
  eventId: string;
  event: McpWebhookEvent;
  status: string;
  attempts: number;
  /** Epoch milliseconds. */
  availableAt: number;
  lastErrorCode: string | null;
}

export interface RepositoryHarness {
  /** A fresh repository instance after every `reset`, so a test may replace its methods. */
  readonly repository: McpEventsRepository;
  subscription(id: string): Promise<EventSubscription | undefined>;
  subscriptions(): Promise<EventSubscription[]>;
  /** Deliveries in insertion order. */
  deliveries(): Promise<DeliveryView[]>;
  setCheckpoint(id: string, checkpoint: string): Promise<void>;
  expire(id: string, expiresAt: string): Promise<void>;
  /** Empties the store; the expensive setup (the D1 database) is shared by the tests of one suite. */
  reset(): Promise<void>;
  dispose(): Promise<void>;
}

async function memoryHarness(): Promise<RepositoryHarness> {
  let repository = new MemoryMcpEventsRepository();
  return {
    get repository() {
      return repository;
    },
    async reset() {
      repository = new MemoryMcpEventsRepository();
    },
    async subscription(id) {
      return repository.subscriptions.get(id);
    },
    async subscriptions() {
      return [...repository.subscriptions.values()];
    },
    async deliveries() {
      return repository.deliveries.map((row) => ({ ...row }));
    },
    async setCheckpoint(id, checkpoint) {
      repository.subscriptions.get(id)!.checkpoint = checkpoint;
    },
    async expire(id, expiresAt) {
      repository.subscriptions.get(id)!.expiresAt = expiresAt;
    },
    async dispose() {},
  };
}

async function d1Harness(): Promise<RepositoryHarness> {
  const store = await createSitesTestStore();
  let repository = new D1McpEventsRepository(store.database);
  return {
    get repository() {
      return repository;
    },
    async reset() {
      // Deleting subscriptions cascades to their deliveries.
      await store.database.prepare("DELETE FROM mcp_event_subscriptions").run();
      repository = new D1McpEventsRepository(store.database);
    },
    async subscription(id) {
      return (await new D1McpEventsRepository(store.database).find(id)) ?? undefined;
    },
    async subscriptions() {
      const { results } = await store.database.prepare("SELECT id FROM mcp_event_subscriptions ORDER BY rowid").all<{ id: string }>();
      return new D1McpEventsRepository(store.database).getMany(results.map((row) => row.id));
    },
    async deliveries() {
      const { results } = await store.database.prepare("SELECT * FROM mcp_event_deliveries ORDER BY rowid").all();
      return results.map((row) => ({
        subscriptionId: row.subscription_id as string,
        articleId: row.article_id as string,
        eventId: row.event_id as string,
        event: JSON.parse(row.event as string) as McpWebhookEvent,
        status: row.status as string,
        attempts: row.attempts as number,
        availableAt: Date.parse(row.available_at as string),
        lastErrorCode: row.last_error_code as string | null,
      }));
    },
    async setCheckpoint(id, checkpoint) {
      await store.database.prepare("UPDATE mcp_event_subscriptions SET checkpoint = ? WHERE id = ?").bind(checkpoint, id).run();
    },
    async expire(id, expiresAt) {
      await store.database.prepare("UPDATE mcp_event_subscriptions SET expires_at = ? WHERE id = ?").bind(expiresAt, id).run();
    },
    dispose: () => store.dispose(),
  };
}

export const repositoryHarnesses: [name: string, create: () => Promise<RepositoryHarness>][] = [
  ["memory", memoryHarness],
  ["d1", d1Harness],
];
