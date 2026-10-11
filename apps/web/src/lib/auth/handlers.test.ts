import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFlowToken, readFlowToken, readSessionToken } from "@atlasnews/adapters/auth/session";
import { describeSession, finishSignIn, signOut, startSignIn } from "./handlers";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => null }));

const site = "https://news.example.com";
const secret = "a-session-secret-that-is-at-least-32-chars";
const flowCookie = "__Host-atlasnews_oauth";
const sessionCookie = "__Host-atlasnews_session";

function configure(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    ATLASNEWS_CONTENT_MODE: "demo",
    NEXT_PUBLIC_SITE_URL: site,
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    ATLASNEWS_SESSION_SECRET: secret,
    GOOGLE_CLIENT_ID: "google-id",
    GOOGLE_CLIENT_SECRET: "google-secret",
    GITHUB_CLIENT_ID: "",
    GITHUB_CLIENT_SECRET: "",
    ...overrides,
  };
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

beforeEach(() => configure());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });

function googleReturns(profile: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
    String(input).includes("oauth2.googleapis.com") ? json({ access_token: "token" }) : json(profile)));
}

function request(path: string, init: { method?: string; cookie?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`${site}${path}`, {
    method: init.method ?? "GET",
    headers: { ...(init.cookie ? { cookie: init.cookie } : {}), ...init.headers },
  });
}

/** Starts a sign-in and returns what the browser would hold: the flow cookie and the state in the URL. */
async function start(returnTo = "/en/articles/x#comments") {
  const response = await startSignIn(request(`/api/auth/google/start?return_to=${encodeURIComponent(returnTo)}`), "google");
  const location = new URL(response.headers.get("location")!);
  return { response, location, cookie: response.cookies.get(flowCookie)!.value, state: location.searchParams.get("state")! };
}

const verified = { sub: "1042", email: "Giulia@Example.com", email_verified: true, name: "Giulia Rossi" };

describe("start", () => {
  it("sends the browser to the provider and keeps the attempt in a signed host-only cookie", async () => {
    const { response, location, cookie, state } = await start();

    expect(response.status).toBe(302);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(`${location.origin}${location.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location.searchParams.get("redirect_uri")).toBe(`${site}/api/auth/google/callback`);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");

    const flow = await readFlowToken(cookie, secret);
    expect(flow).toMatchObject({ provider: "google", state, returnTo: "/en/articles/x#comments" });
    // The verifier stays in the cookie; only its hash goes to the provider.
    expect(location.search).not.toContain(flow!.codeVerifier);

    const header = response.headers.getSetCookie().find((entry) => entry.startsWith(flowCookie))!;
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/SameSite=lax/i);
    expect(header).toMatch(/Path=\//);
    expect(header).toMatch(/Max-Age=600/);
    expect(header).not.toMatch(/Domain=/i);
  });

  it("never remembers a return path that leaves the site or points back into auth", async () => {
    for (const unsafe of ["//evil.example", "https://evil.example/x", "/api/auth/signout", "/\\evil.example"]) {
      const { cookie } = await start(unsafe);
      expect((await readFlowToken(cookie, secret))?.returnTo, unsafe).toBe("/");
    }
  });

  it("answers 404 for an unknown provider and for one that is not configured", async () => {
    expect((await startSignIn(request("/api/auth/facebook/start"), "facebook")).status).toBe(404);
    expect((await startSignIn(request("/api/auth/github/start"), "github")).status).toBe(404);
    configure({ ATLASNEWS_SESSION_SECRET: "" });
    expect((await startSignIn(request("/api/auth/google/start"), "google")).status).toBe(404);
  });

  it("drops the __Host- prefix and Secure only on a loopback http site", async () => {
    configure({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" });
    const response = await startSignIn(request("/api/auth/google/start"), "google");
    const header = response.headers.getSetCookie()[0]!;

    expect(header.startsWith("atlasnews_oauth=")).toBe(true);
    expect(header).not.toMatch(/Secure/i);
    expect(header).toMatch(/HttpOnly/i);
  });
});

describe("callback", () => {
  async function callback(options: { query?: string; cookie?: string; provider?: string } = {}) {
    const attempt = await start();
    const query = options.query ?? `code=the-code&state=${attempt.state}`;
    const cookie = options.cookie ?? `${flowCookie}=${attempt.cookie}`;
    return finishSignIn(request(`/api/auth/google/callback?${query}`, { cookie }), options.provider ?? "google");
  }

  const failed = (response: Response, code: string) => {
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get("location")!).pathname + new URL(response.headers.get("location")!).search).toBe(`/en/login?error=${code}`);
    expect(response.headers.getSetCookie().some((entry) => entry.startsWith(sessionCookie))).toBe(false);
  };

  it("signs the person in and returns to the page they came from", async () => {
    googleReturns(verified);
    const response = await callback();

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${site}/en/articles/x#comments`);
    const session = await readSessionToken(response.cookies.get(sessionCookie)?.value, secret);
    expect(session).toEqual({ sub: "google:1042", provider: "google", email: "giulia@example.com", name: "Giulia Rossi" });

    const header = response.headers.getSetCookie().find((entry) => entry.startsWith(sessionCookie))!;
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/SameSite=lax/i);
    expect(header).toMatch(/Max-Age=2592000/);
    // The attempt is spent.
    expect(response.headers.getSetCookie().find((entry) => entry.startsWith(flowCookie))).toMatch(/Max-Age=0/);
  });

  it("refuses a callback whose state is not the one this browser started", async () => {
    googleReturns(verified);
    failed(await callback({ query: "code=the-code&state=forged" }), "oauth_failed");
    failed(await callback({ query: "code=the-code" }), "oauth_failed");
  });

  it("refuses a callback without an attempt, with a tampered one, or one started for another provider", async () => {
    googleReturns(verified);
    const attempt = await start();
    const query = `code=the-code&state=${attempt.state}`;
    failed(await finishSignIn(request(`/api/auth/google/callback?${query}`), "google"), "oauth_failed");

    const [body, mac] = attempt.cookie.split(".") as [string, string];
    const forgedBody = btoa(JSON.stringify({ ...JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))), returnTo: "https://evil.example" }));
    failed(await finishSignIn(request(`/api/auth/google/callback?${query}`, { cookie: `${flowCookie}=${forgedBody}.${mac}` }), "google"), "oauth_failed");

    const githubFlow = await createFlowToken({ provider: "github", state: attempt.state, codeVerifier: "v", returnTo: "/en" }, secret);
    failed(await finishSignIn(request(`/api/auth/google/callback?${query}`, { cookie: `${flowCookie}=${githubFlow.value}` }), "google"), "oauth_failed");
  });

  it("refuses an attempt that is more than ten minutes old", async () => {
    googleReturns(verified);
    const attempt = await start();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    failed(
      await finishSignIn(request(`/api/auth/google/callback?code=c&state=${attempt.state}`, { cookie: `${flowCookie}=${attempt.cookie}` }), "google"),
      "oauth_failed",
    );
  });

  it("does not sign in an email the provider has not verified", async () => {
    googleReturns({ ...verified, email_verified: false });
    failed(await callback(), "oauth_email");
  });

  it("reports a refused consent and a failed exchange without a session", async () => {
    failed(await callback({ query: "error=access_denied&state=" }), "oauth_failed");
    const attempt = await start();
    failed(await finishSignIn(request(`/api/auth/google/callback?error=access_denied&state=${attempt.state}`, { cookie: `${flowCookie}=${attempt.cookie}` }), "google"), "oauth_denied");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 400 })));
    failed(await callback(), "oauth_failed");
  });
});

describe("sign out", () => {
  const post = (path: string, headers: Record<string, string>) => request(path, { method: "POST", headers });

  it("clears the session and returns to a safe path with a 303", async () => {
    const response = await signOut(post("/api/auth/signout?return_to=/it/articles/x%23comments", { origin: site }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${site}/it/articles/x#comments`);
    const header = response.headers.getSetCookie().find((entry) => entry.startsWith(sessionCookie))!;
    expect(header).toMatch(/Max-Age=0/);
    expect(header).toMatch(/Secure/i);
  });

  it("never returns to another site", async () => {
    const response = await signOut(post("/api/auth/signout?return_to=https://evil.example", { origin: site }));
    expect(response.headers.get("location")).toBe(`${site}/`);
  });

  it("refuses a request from another site and one the browser does not vouch for", async () => {
    for (const headers of [{ origin: "https://evil.example" }, { "sec-fetch-site": "cross-site" }, {}] as Array<Record<string, string>>) {
      const response = await signOut(post("/api/auth/signout", headers));
      expect(response.status, JSON.stringify(headers)).toBe(403);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
    expect((await signOut(post("/api/auth/signout", { "sec-fetch-site": "same-origin" }))).status).toBe(303);
  });
});

describe("session summary", () => {
  const read = async (user: Parameters<typeof describeSession>[0]) => (await describeSession(user)).json();

  it("lists how to sign in and shows only the name of who is signed in", async () => {
    expect(await read(async () => null)).toEqual({ user: null, providers: ["google"] });
    expect(await read(async () => ({ userId: "google:1", email: "giulia@example.com", name: null, provider: "google" })))
      .toEqual({ user: { displayName: "giulia", provider: "google" }, providers: ["google"] });
  });

  it("offers ChatGPT on Sites", async () => {
    configure({ ATLASNEWS_CONTENT_MODE: "sites" });
    expect((await read(async () => null)).providers).toEqual(["chatgpt", "google"]);
  });
});
