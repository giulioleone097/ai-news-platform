import type { CommentNotificationEvent } from "../domain/comment";

export interface CommentNotificationOutbox {
  claim(workerId: string, limit: number): Promise<CommentNotificationEvent[]>;
  start(input: { id: string; workerId: string }): Promise<boolean>;
  complete(input: {
    id: string;
    workerId: string;
    succeeded: boolean;
    providerMessageId?: string | null;
    error?: string | null;
  }): Promise<void>;
}

export interface CommentNotificationProvider {
  send(event: CommentNotificationEvent): Promise<{ messageId: string }>;
}
