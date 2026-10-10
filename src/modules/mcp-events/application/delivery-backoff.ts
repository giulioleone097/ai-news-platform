export const maximumDeliveryAttempts = 8;
const baseDelaySeconds = 30;
const maximumDelaySeconds = 60 * 60;

/** Exponential backoff after the given (1-based) failed attempt, capped at one hour. */
export function nextDeliveryAt(attempt: number, now: Date) {
  const delaySeconds = Math.min(
    baseDelaySeconds * 2 ** Math.max(attempt - 1, 0),
    maximumDelaySeconds,
  );
  return new Date(now.getTime() + delaySeconds * 1000).toISOString();
}
