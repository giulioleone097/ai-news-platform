const maximumBackoffSeconds = 6 * 60 * 60;

function stableJitterSeconds(key: string, window: number) {
  let hash = 2166136261;
  for (const character of key) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % Math.max(window, 1);
}

export function nextRetryAt(input: {
  attempt: number;
  idempotencyKey: string;
  now?: Date;
  retryAfterSeconds?: number;
}) {
  const base = Math.min(30 * (2 ** Math.max(input.attempt - 1, 0)), maximumBackoffSeconds);
  const requested = Math.min(Math.max(input.retryAfterSeconds ?? 0, 0), maximumBackoffSeconds);
  const delaySeconds = Math.max(base, requested) + stableJitterSeconds(input.idempotencyKey, 17);
  return new Date((input.now ?? new Date()).getTime() + delaySeconds * 1_000).toISOString();
}
