import type {
  ContactMessage,
  ContactMessagePage,
  ContactMessageQuery,
  ContactMessageStatus,
} from "./contact-message";

export interface ContactMessageRepository {
  /**
   * Stores the message unless the sender is over a limit. `requesterKey` is the 64-character hex key of the
   * sender's network; the adapter counts it in its own bucket and in the site-wide one, in the same write.
   */
  create(input: { message: ContactMessage; requesterKey: string }): Promise<"created" | "rate_limited">;
  /** Newest first, filtered by status, one page after the cursor. */
  list(query: ContactMessageQuery): Promise<ContactMessagePage>;
  count(status: ContactMessageStatus): Promise<number>;
  /** False when no message has this id. */
  setStatus(id: string, status: ContactMessageStatus): Promise<boolean>;
  /** False when no message has this id. */
  delete(id: string): Promise<boolean>;
}
