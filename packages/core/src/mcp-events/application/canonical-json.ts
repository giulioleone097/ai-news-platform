import { createHash } from "node:crypto";

/** JSON with recursively sorted object keys; `undefined` object members are omitted. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const members = Object.entries(value)
      .filter(([, member]) => member !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`);
    return `{${members.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** Deterministic id from the identity of a subscription. */
export function deriveSubscriptionId(identity: {
  principal: string;
  url: string;
  name: string;
  arguments: unknown;
}) {
  return `sub_${sha256Hex(canonicalJson(identity))}`;
}

/** Stable across retries: one event per (subscription, article). */
export function deriveEventId(subscriptionId: string, articleId: string) {
  return `evt_${sha256Hex(`${subscriptionId}:${articleId}`)}`;
}
