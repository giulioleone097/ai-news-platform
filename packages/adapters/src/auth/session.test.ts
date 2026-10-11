import { describe, expect, it } from "vitest";
import { encodeBase64Url } from "./base64url";
import {
  createFlowToken,
  createSessionToken,
  flowLifetimeSeconds,
  readFlowToken,
  readSessionToken,
  sessionLifetimeSeconds,
  timingSafeEqual,
} from "./session";

const secret = "test-session-secret-that-is-at-least-32-chars";
const otherSecret = "another-session-secret-that-is-32-chars-long";
const now = Date.UTC(2026, 9, 11, 12, 0, 0);
const profile = { provider: "google", providerUserId: "1042", email: "giulia@example.com", name: "Giulia" } as const;

/** The same token with its payload replaced and the old MAC kept. */
function withPayload(token: string, changes: Record<string, unknown>) {
  const [body, mac] = token.split(".") as [string, string];
  const payload = { ...JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))), ...changes };
  return `${encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)))}.${mac}`;
}

/** A token with a real MAC for any payload, as only the secret's holder could make. */
async function signed(domain: string, payload: unknown) {
  const body = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${domain}.${body}`));
  return `${body}.${encodeBase64Url(new Uint8Array(mac))}`;
}

describe("session cookie", () => {
  it("round-trips a signed-in person", async () => {
    const { value, maxAge } = await createSessionToken(profile, secret, now);

    expect(maxAge).toBe(sessionLifetimeSeconds);
    expect(await readSessionToken(value, secret, now + 1000)).toEqual({
      sub: "google:1042",
      provider: "google",
      email: "giulia@example.com",
      name: "Giulia",
    });
  });

  it("expires after 30 days, to the second", async () => {
    const { value } = await createSessionToken(profile, secret, now);
    expect(await readSessionToken(value, secret, now + (sessionLifetimeSeconds - 1) * 1000)).not.toBeNull();
    expect(await readSessionToken(value, secret, now + sessionLifetimeSeconds * 1000)).toBeNull();
  });

  it("rejects a tampered payload, a tampered MAC, another secret and garbage", async () => {
    const { value } = await createSessionToken(profile, secret, now);
    const [body, mac] = value.split(".") as [string, string];

    expect(await readSessionToken(withPayload(value, { email: "admin@example.com" }), secret, now)).toBeNull();
    expect(await readSessionToken(withPayload(value, { sub: "github:1" }), secret, now)).toBeNull();
    expect(await readSessionToken(`${body}.${mac.slice(0, -2)}AA`, secret, now)).toBeNull();
    expect(await readSessionToken(value, otherSecret, now)).toBeNull();
    for (const garbage of [undefined, "", "abc", "a.b.c", `${body}.`, `.${mac}`, "%%%.%%%", "x".repeat(5000)]) {
      expect(await readSessionToken(garbage, secret, now)).toBeNull();
    }
  });

  it("rejects a validly signed payload of the wrong shape", async () => {
    const exp = Math.floor(now / 1000) + 60;
    const good = { sub: "google:1", email: "a@example.com", name: null, exp };
    expect(await readSessionToken(await signed("session", good), secret, now)).not.toBeNull();

    for (const bad of [
      { ...good, sub: "evil:1" },
      { ...good, sub: "google:" },
      { ...good, email: 7 },
      { ...good, name: 7 },
      { ...good, exp: String(exp) },
      { ...good, exp: undefined },
    ]) {
      expect(await readSessionToken(await signed("session", bad), secret, now)).toBeNull();
    }
    expect(await readSessionToken(await signed("session", [1, 2]), secret, now)).toBeNull();
  });

  it("does not accept a flow token as a session, or the reverse", async () => {
    const flow = await createFlowToken({ provider: "google", state: "s", codeVerifier: "v", returnTo: "/en" }, secret, now);
    const session = await createSessionToken(profile, secret, now);

    expect(await readSessionToken(flow.value, secret, now)).toBeNull();
    expect(await readFlowToken(session.value, secret, now)).toBeNull();
  });
});

describe("OAuth flow cookie", () => {
  const flow = { provider: "github", state: "state-1", codeVerifier: "verifier-1", returnTo: "/it/articles/x#comments" } as const;

  it("round-trips an attempt and expires after 10 minutes", async () => {
    const { value, maxAge } = await createFlowToken(flow, secret, now);

    expect(maxAge).toBe(flowLifetimeSeconds);
    expect(await readFlowToken(value, secret, now + 1000)).toEqual(flow);
    expect(await readFlowToken(value, secret, now + flowLifetimeSeconds * 1000)).toBeNull();
  });

  it("rejects a tampered attempt", async () => {
    const { value } = await createFlowToken(flow, secret, now);

    expect(await readFlowToken(withPayload(value, { state: "attacker-state" }), secret, now)).toBeNull();
    expect(await readFlowToken(withPayload(value, { returnTo: "https://evil.example" }), secret, now)).toBeNull();
    expect(await readFlowToken(value, otherSecret, now)).toBeNull();
  });
});

describe("timingSafeEqual", () => {
  it("compares strings of any length", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
