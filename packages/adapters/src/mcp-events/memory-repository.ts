import { randomUUID } from "node:crypto";

import type { McpEventsRepository } from "@atlasnews/core/mcp-events/domain/ports";
import {
  isSubscriptionLive,
  type ClaimedDelivery,
  type EventSubscription,
  type NewDelivery,
  type SubscriptionStatus,
} from "@atlasnews/core/mcp-events/domain/subscription";

interface DeliveryRow extends NewDelivery {
  id: string;
  status: "pending" | "processing" | "delivered" | "failed" | "cancelled";
  attempts: number;
  maxAttempts: number;
  availableAt: number;
  leaseToken: string | null;
  leaseExpiresAt: number | null;
  lastErrorCode: string | null;
  updatedAt: number;
}

/** In-memory adapter for tests and local development. */
export class MemoryMcpEventsRepository implements McpEventsRepository {
  readonly subscriptions = new Map<string, EventSubscription>();
  readonly deliveries: DeliveryRow[] = [];

  async find(id: string) {
    return this.subscriptions.get(id) ?? null;
  }

  async save(subscription: EventSubscription) {
    this.subscriptions.set(subscription.id, { ...subscription });
  }

  async deactivate(id: string, status: Exclude<SubscriptionStatus, "active">) {
    const subscription = this.subscriptions.get(id);
    if (subscription?.status === "active") {
      this.subscriptions.set(id, { ...subscription, status, updatedAt: new Date().toISOString() });
    }
  }

  async countLiveForHost(host: string, excludingId: string, now: Date) {
    return [...this.subscriptions.values()].filter(
      (subscription) => subscription.host === host
        && subscription.id !== excludingId
        && isSubscriptionLive(subscription, now),
    ).length;
  }

  async findVerifiedAt(input: { principal: string; url: string; secret: string; since: Date }) {
    const match = [...this.subscriptions.values()]
      .filter((subscription) => subscription.principal === input.principal
        && subscription.url === input.url
        && subscription.secret === input.secret
        && Date.parse(subscription.verifiedAt) >= input.since.getTime())
      .sort((left, right) => right.verifiedAt.localeCompare(left.verifiedAt))[0];
    return match?.verifiedAt ?? null;
  }

  async listLive(now: Date, limit: number) {
    return [...this.subscriptions.values()]
      .filter((subscription) => isSubscriptionLive(subscription, now))
      .slice(0, limit);
  }

  async getMany(ids: string[]) {
    return ids.flatMap((id) => this.subscriptions.get(id) ?? []);
  }

  async advanceCheckpoint(id: string, checkpoint: string) {
    const subscription = this.subscriptions.get(id);
    if (subscription && checkpoint > subscription.checkpoint) subscription.checkpoint = checkpoint;
  }

  async enqueue(deliveries: NewDelivery[], maxAttempts: number, now: Date) {
    let queued = 0;
    for (const delivery of deliveries) {
      const duplicate = this.deliveries.some(
        (row) => row.subscriptionId === delivery.subscriptionId && row.articleId === delivery.articleId,
      );
      if (duplicate) continue;
      this.deliveries.push({
        ...delivery,
        id: randomUUID(),
        status: "pending",
        attempts: 0,
        maxAttempts,
        availableAt: now.getTime(),
        leaseToken: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
        updatedAt: now.getTime(),
      });
      queued += 1;
    }
    return queued;
  }

  async claim(input: { workerToken: string; limit: number; leaseSeconds: number; now: Date }) {
    const now = input.now.getTime();
    const claimed: ClaimedDelivery[] = [];
    const due = this.deliveries
      .filter((row) => {
        const subscription = this.subscriptions.get(row.subscriptionId);
        if (!subscription || !isSubscriptionLive(subscription, input.now)) return false;
        const leaseLapsed = row.status === "processing" && (row.leaseExpiresAt ?? 0) <= now;
        return (row.status === "pending" && row.availableAt <= now && row.attempts < row.maxAttempts)
          || (leaseLapsed && row.attempts < row.maxAttempts);
      })
      .sort((left, right) => left.availableAt - right.availableAt)
      .slice(0, input.limit);
    for (const row of due) {
      row.status = "processing";
      row.attempts += 1;
      row.leaseToken = input.workerToken;
      row.leaseExpiresAt = now + input.leaseSeconds * 1000;
      claimed.push({
        id: row.id,
        subscriptionId: row.subscriptionId,
        eventId: row.eventId,
        event: row.event,
        attempts: row.attempts,
        maxAttempts: row.maxAttempts,
      });
    }
    return claimed;
  }

  private leased(id: string, workerToken: string) {
    const row = this.deliveries.find((item) => item.id === id);
    return row && row.status === "processing" && row.leaseToken === workerToken ? row : null;
  }

  private finish(id: string, workerToken: string, status: DeliveryRow["status"], now: Date, errorCode: string | null) {
    const row = this.leased(id, workerToken);
    if (!row) return;
    row.status = status;
    row.leaseToken = null;
    row.leaseExpiresAt = null;
    row.lastErrorCode = errorCode;
    row.updatedAt = now.getTime();
  }

  async markDelivered(id: string, workerToken: string, now: Date) {
    this.finish(id, workerToken, "delivered", now, null);
  }

  async markRetry(input: { id: string; workerToken: string; availableAt: string; errorCode: string }) {
    const row = this.leased(input.id, input.workerToken);
    if (!row) return;
    row.status = "pending";
    row.leaseToken = null;
    row.leaseExpiresAt = null;
    row.availableAt = Date.parse(input.availableAt);
    row.lastErrorCode = input.errorCode;
  }

  async markFailed(input: { id: string; workerToken: string; errorCode: string; now: Date }) {
    this.finish(input.id, input.workerToken, "failed", input.now, input.errorCode);
  }

  async markCancelled(id: string, workerToken: string, now: Date) {
    this.finish(id, workerToken, "cancelled", now, null);
  }

  async prune(before: Date) {
    const cutoff = before.getTime();
    for (const [id, subscription] of this.subscriptions) {
      const ended = subscription.status !== "active" || Date.parse(subscription.expiresAt) <= cutoff;
      if (ended && Date.parse(subscription.updatedAt) <= cutoff) this.subscriptions.delete(id);
    }
    for (let index = this.deliveries.length - 1; index >= 0; index -= 1) {
      const row = this.deliveries[index];
      const finished = row.status === "delivered" || row.status === "failed" || row.status === "cancelled";
      if (!this.subscriptions.has(row.subscriptionId) || (finished && row.updatedAt <= cutoff)) {
        this.deliveries.splice(index, 1);
      }
    }
  }
}
