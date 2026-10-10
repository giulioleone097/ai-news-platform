import { randomUUID } from "node:crypto";

import { WebhookTransportError } from "../domain/errors";
import type { McpEventsRepository, WebhookClient } from "../domain/ports";
import {
  activeSigningSecrets,
  isSubscriptionLive,
  type ClaimedDelivery,
  type EventSubscription,
} from "../domain/subscription";
import { nextDeliveryAt } from "./delivery-backoff";
import { buildWebhookHeaders } from "./webhook-signing";

export const deliveryTimeoutMs = 10_000;
export const maximumEventBodyBytes = 256 * 1024;
const claimLimit = 20;
const leaseSeconds = 90;
const concurrency = 5;

export interface DispatchSummary {
  claimed: number;
  delivered: number;
  retried: number;
  failed: number;
  cancelled: number;
}

type Outcome = keyof Omit<DispatchSummary, "claimed">;

/** Sends claimed outbox deliveries as signed webhooks and records the outcome. */
export class DeliveryDispatcher {
  constructor(
    private readonly repository: McpEventsRepository,
    private readonly client: WebhookClient,
    private readonly clock: () => Date = () => new Date(),
    private readonly newToken: () => string = randomUUID,
  ) {}

  async run(): Promise<DispatchSummary> {
    const workerToken = this.newToken();
    const claimed = await this.repository.claim({
      workerToken,
      limit: claimLimit,
      leaseSeconds,
      now: this.clock(),
    });
    const subscriptions = new Map(
      (await this.repository.getMany([...new Set(claimed.map((item) => item.subscriptionId))]))
        .map((subscription) => [subscription.id, subscription]),
    );

    const summary: DispatchSummary = { claimed: claimed.length, delivered: 0, retried: 0, failed: 0, cancelled: 0 };
    for (let index = 0; index < claimed.length; index += concurrency) {
      const outcomes = await Promise.all(
        claimed.slice(index, index + concurrency).map((delivery) =>
          this.deliver(delivery, subscriptions.get(delivery.subscriptionId), workerToken)),
      );
      for (const outcome of outcomes) summary[outcome] += 1;
    }
    return summary;
  }

  private async deliver(
    delivery: ClaimedDelivery,
    subscription: EventSubscription | undefined,
    workerToken: string,
  ): Promise<Outcome> {
    const now = this.clock();
    if (!subscription || !isSubscriptionLive(subscription, now)) {
      await this.repository.markCancelled(delivery.id, workerToken, now);
      return "cancelled";
    }

    const body = JSON.stringify(delivery.event);
    if (Buffer.byteLength(body, "utf8") > maximumEventBodyBytes) {
      await this.repository.markFailed({ id: delivery.id, workerToken, errorCode: "payload_too_large", now });
      return "failed";
    }

    try {
      const response = await this.client.post({
        url: subscription.url,
        headers: buildWebhookHeaders({
          messageId: delivery.eventId,
          subscriptionId: subscription.id,
          secrets: activeSigningSecrets(subscription, now),
          body,
          now,
        }),
        body,
        timeoutMs: deliveryTimeoutMs,
      });
      if (response.status >= 200 && response.status <= 299) {
        await this.repository.markDelivered(delivery.id, workerToken, this.clock());
        return "delivered";
      }
      if (response.status === 410) {
        await this.repository.deactivate(subscription.id, "gone");
        return this.fail(delivery, workerToken, "http_410");
      }
      if (response.status === 413) return this.fail(delivery, workerToken, "http_413");
      return this.retry(delivery, workerToken, `http_${response.status}`);
    } catch (error) {
      if (error instanceof WebhookTransportError
        && (error.reason === "blocked_address" || error.reason === "invalid_url")) {
        return this.fail(delivery, workerToken, error.reason);
      }
      return this.retry(
        delivery,
        workerToken,
        error instanceof WebhookTransportError ? error.reason : "delivery_error",
      );
    }
  }

  private async fail(delivery: ClaimedDelivery, workerToken: string, errorCode: string): Promise<Outcome> {
    await this.repository.markFailed({ id: delivery.id, workerToken, errorCode, now: this.clock() });
    return "failed";
  }

  private async retry(delivery: ClaimedDelivery, workerToken: string, errorCode: string): Promise<Outcome> {
    if (delivery.attempts >= delivery.maxAttempts) return this.fail(delivery, workerToken, errorCode);
    await this.repository.markRetry({
      id: delivery.id,
      workerToken,
      availableAt: nextDeliveryAt(delivery.attempts, this.clock()),
      errorCode,
    });
    return "retried";
  }
}
