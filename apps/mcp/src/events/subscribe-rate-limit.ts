import { getMcpEventsSubscribeRate } from "@atlasnews/adapters/config/env";
import { getClientNetwork } from "@atlasnews/adapters/config/client-address";

const windowMs = 60_000;
const maximumKeys = 10_000;
/** Every caller shares this key while no trusted client address header is configured. */
const sharedKey = "shared";

/**
 * Fixed-window counter per client network for `events/subscribe`, which makes this server send a
 * verification request to a caller-chosen HTTPS address. Anonymous callers may subscribe (ChatGPT
 * does), so the limit is the only brake on using that as an outbound request generator.
 *
 * Without `ATLASNEWS_CLIENT_IP_HEADER` no per-caller identity can be trusted, so one shared window
 * covers every caller: the brake still holds, and a caller who floods it can delay others for at most a
 * minute but cannot subscribe more. ceiling: the counters live in this process; behind several
 * instances the effective limit is multiplied by their number. Move them to Supabase if that matters.
 */
export class SubscribeRateLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Seconds to wait when the caller is over the limit, otherwise null. */
  take(headers: Headers, limit = getMcpEventsSubscribeRate()) {
    const now = this.now();
    const key = getClientNetwork(headers) ?? sharedKey;
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
    // A full map of live windows means more distinct networks than the bound: start over rather than grow.
    if (this.windows.size >= maximumKeys) this.windows.clear();
  }
}
