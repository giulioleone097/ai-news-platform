const hour = 60 * 60 * 1000;
const day = 24 * hour;

export const defaultSubscriptionTtlMs = 7 * day;
export const minimumSubscriptionTtlMs = hour;
export const maximumSubscriptionTtlMs = 30 * day;

/**
 * Granted lifetime in milliseconds. A smaller request is honored down to one hour;
 * an omitted or `null` (never expires) request gets the default, and nothing exceeds 30 days.
 */
export function grantSubscriptionTtl(requested: number | null | undefined) {
  if (requested === null || requested === undefined) return defaultSubscriptionTtlMs;
  return Math.min(
    Math.max(Math.floor(requested), minimumSubscriptionTtlMs),
    maximumSubscriptionTtlMs,
  );
}
