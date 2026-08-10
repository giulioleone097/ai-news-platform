import { randomUUID } from "node:crypto";
import type {
  CommentNotificationOutbox,
  CommentNotificationProvider,
} from "./notification-outbox";

export class CommentNotificationDeliveryService {
  constructor(
    private readonly outbox: CommentNotificationOutbox,
    private readonly provider: CommentNotificationProvider,
  ) {}

  async processBatch(input: { limit?: number } = {}) {
    const limit = Math.min(50, Math.max(1, input.limit ?? 10));
    const workerId = `comment-${randomUUID()}`;
    const events = await this.outbox.claim(workerId, limit);
    const results: Array<"sent" | "failed" | "skipped"> = [];

    for (let index = 0; index < events.length; index += 3) {
      const chunk = events.slice(index, index + 3);
      results.push(...await Promise.all(chunk.map(async (event) => {
        const started = await this.outbox.start({ id: event.id, workerId });
        if (!started) return "skipped" as const;

        try {
          const receipt = await this.provider.send(event);
          await this.outbox.complete({
            id: event.id,
            workerId,
            succeeded: true,
            providerMessageId: receipt.messageId,
          });
          return "sent" as const;
        } catch (error) {
          await this.outbox.complete({
            id: event.id,
            workerId,
            succeeded: false,
            error: error instanceof Error ? error.message : "Comment notification delivery failed.",
          });
          return "failed" as const;
        }
      })));
    }

    return {
      claimed: events.length,
      sent: results.filter((result) => result === "sent").length,
      failed: results.filter((result) => result === "failed").length,
      skipped: results.filter((result) => result === "skipped").length,
    };
  }
}
