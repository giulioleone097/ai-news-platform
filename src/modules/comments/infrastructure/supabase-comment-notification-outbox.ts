import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import * as z from "zod/v4";
import { CommentOperationError } from "../application/errors";
import type { CommentNotificationOutbox } from "../application/notification-outbox";
import { commentNotificationKinds, commentLocales } from "../domain/comment";

const notificationRowSchema = z.object({
  id: z.string().uuid(),
  subscription_id: z.string().uuid(),
  comment_id: z.string().uuid().nullable(),
  kind: z.enum(commentNotificationKinds),
  recipient_email: z.email(),
  locale: z.enum(commentLocales),
  payload: z.record(z.string(), z.unknown()),
  attempts: z.coerce.number().int().min(1).max(20),
});

export class SupabaseCommentNotificationOutbox implements CommentNotificationOutbox {
  constructor(private readonly client: SupabaseClient) {}

  async claim(workerId: string, limit: number) {
    const { data, error } = await this.client.rpc("claim_comment_notifications", {
      p_worker_id: workerId,
      p_limit: limit,
    });
    if (error) {
      throw new CommentOperationError("storage_error", "Notification outbox is unavailable.", 503);
    }
    const parsed = z.array(notificationRowSchema).safeParse(data ?? []);
    if (!parsed.success) {
      throw new CommentOperationError("storage_error", "Invalid notification outbox response.", 503);
    }
    return parsed.data.map((row) => ({
      id: row.id,
      subscriptionId: row.subscription_id,
      commentId: row.comment_id,
      kind: row.kind,
      recipientEmail: row.recipient_email,
      locale: row.locale,
      payload: row.payload,
      attempts: row.attempts,
    }));
  }

  async start(input: { id: string; workerId: string }) {
    const { data, error } = await this.client.rpc("start_comment_notification_delivery", {
      p_notification_id: input.id,
      p_worker_id: input.workerId,
    });
    if (error || typeof data !== "boolean") {
      throw new CommentOperationError("storage_error", "Notification dispatch boundary failed.", 503);
    }
    return data;
  }

  async complete(input: {
    id: string;
    workerId: string;
    succeeded: boolean;
    providerMessageId?: string | null;
    error?: string | null;
  }) {
    const { error } = await this.client.rpc("complete_comment_notification", {
      p_notification_id: input.id,
      p_worker_id: input.workerId,
      p_succeeded: input.succeeded,
      p_provider_message_id: input.providerMessageId ?? null,
      p_error: input.error ?? null,
    });
    if (error) {
      throw new CommentOperationError("storage_error", "Notification outbox update failed.", 503);
    }
  }
}
