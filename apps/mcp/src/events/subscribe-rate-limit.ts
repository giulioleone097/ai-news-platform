import { getMcpEventsSubscribeRate } from "@atlasnews/adapters/config/env";

const windowMs = 60_000;
const maximumKeys = 10_000;

/**
 * Fixed-window counter per signed-in caller for `events/subscribe`, which makes this server send a
 * verification request to a caller-chosen HTTPS address. A verification that fails stores nothing, so the
 * durable per-principal cap on live subscriptions cannot count those attempts; this brake does.
 *
 * ceiling: the counters live in this process; behind several instances (Worker isolates, containers) the
 * effective limit is multiplied by their number. Move them to the store if that matters.
 */
export class SubscribeRateLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Seconds to wait when the caller is over the limit, otherwise null. */
  take(key: string, limit = getMcpEventsSubscribeRate()) {
    const now = this.now();
    const current = this.windows.get(key);
    if (!current || now - current.startedAt >= windowMs) {
      if (this.windows.size >= maximumKeys) this.prune(now);
      this.windows.set(key, { startedAt: now, count: 1 });
      return null;
    }
    current.count += 1;
    return current.count > limit ? Math.max(1, Math.ceil((current.startedAt + windowMs - now) / 1000)) : null;
  }

  private prune(now: number) {
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= windowMs) this.windows.delete(key);
    }
    // A full map of live windows means more distinct callers than the bound: start over rather than grow.
    if (this.windows.size >= maximumKeys) this.windows.clear();
  }
}
