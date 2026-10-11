import {
  contactPolicy,
  toContactPage,
  type ContactMessage,
  type ContactMessageQuery,
  type ContactMessageStatus,
} from "@atlasnews/core/support/domain/contact-message";
import type { ContactMessageRepository } from "@atlasnews/core/support/domain/ports";

const requesterWindowMs = contactPolicy.requesterWindowMinutes * 60_000;
const siteWindowMs = 3_600_000;

interface Bucket {
  windowStart: number;
  count: number;
}

/** Contact messages in memory, for the demo mode and for tests. The limits are the ones the D1 and Supabase adapters apply. */
export class MemoryContactRepository implements ContactMessageRepository {
  private readonly messages = new Map<string, ContactMessage>();
  private readonly requesters = new Map<string, Bucket>();
  private site: Bucket = { windowStart: 0, count: 0 };

  constructor(private readonly now: () => number = Date.now) {}

  private tick(bucket: Bucket | undefined, windowMs: number) {
    const windowStart = Math.floor(this.now() / windowMs) * windowMs;
    const next = bucket?.windowStart === windowStart ? bucket.count + 1 : 1;
    return { windowStart, count: next };
  }

  async create({ message, requesterKey }: { message: ContactMessage; requesterKey: string }) {
    const requester = this.tick(this.requesters.get(requesterKey), requesterWindowMs);
    this.requesters.set(requesterKey, requester);
    if (requester.count > contactPolicy.requesterLimit) return "rate_limited" as const;

    this.site = this.tick(this.site, siteWindowMs);
    if (this.site.count > contactPolicy.siteLimit) return "rate_limited" as const;

    this.messages.set(message.id, { ...message });
    return "created" as const;
  }

  async list(query: ContactMessageQuery) {
    const { cursor, status, limit } = query;
    const rows = [...this.messages.values()]
      .filter((message) => !status || message.status === status)
      .sort((a, b) => (a.createdAt === b.createdAt ? b.id.localeCompare(a.id) : b.createdAt.localeCompare(a.createdAt)))
      .filter((message) => !cursor
        || message.createdAt < cursor.createdAt
        || (message.createdAt === cursor.createdAt && message.id < cursor.id))
      .slice(0, limit + 1)
      .map((message) => ({ ...message }));
    return toContactPage(rows, limit);
  }

  async count(status: ContactMessageStatus) {
    return [...this.messages.values()].filter((message) => message.status === status).length;
  }

  async setStatus(id: string, status: ContactMessageStatus) {
    const message = this.messages.get(id);
    if (!message) return false;
    message.status = status;
    return true;
  }

  async delete(id: string) {
    return this.messages.delete(id);
  }
}
