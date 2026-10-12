import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { exportJWK, generateKeyPair, SignJWT, type JWK, type CryptoKey } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { scopes, scopesForRole } from "@atlasnews/contract";

import {
  bearerChallenge,
  defaultAccessTokenVerifier,
  resolvePrincipal,
  Unauthorized,
} from "../auth";
import { handleMcpRequest } from "../http";
import { memoryPorts, modernParams, rpcRequest, testApiKey } from "../mcp-test-client";
import { GET as getResourceMetadata } from "../routes/oauth-metadata";
import { createAccessTokenVerifier } from "./access-token";
import { supabaseEditorDirectory } from "./editors";
import { supabaseOAuthVerifier } from "./supabase-oauth";

const editorId = "11111111-1111-4111-8111-111111111111";
const adminId = "22222222-2222-4222-8222-222222222222";
const readerId = "33333333-3333-4333-8333-333333333333";
const editorAuthorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const clientId = "9a8b7c6d-5e4f-4a2b-9c0d-9e8f7a6b5c4d";
const serviceRoleKey = "s".repeat(40);

interface Signer {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JWK;
}

async function newSigner(kid: string): Promise<Signer> {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  return { kid, privateKey, publicJwk: { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig" } };
}

/** A local stand-in for the two Supabase endpoints the server talks to: the JWKS and PostgREST profiles. */
async function startSupabaseDouble() {
  const state = {
    keys: [] as JWK[],
    profiles: new Map<string, { author_id: string; role: string }>(),
    jwksStatus: 200,
    jwksHits: 0,
    profileHits: 0,
    authorization: [] as string[],
  };
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/auth/v1/.well-known/jwks.json") {
      state.jwksHits += 1;
      response.writeHead(state.jwksStatus, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ keys: state.keys }));
    } else if (url.pathname === "/rest/v1/profiles") {
      state.profileHits += 1;
      state.authorization.push(String(request.headers.authorization));
      const id = url.searchParams.get("id")?.replace(/^eq\./, "") ?? "";
      const row = state.profiles.get(id);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(row ? [row] : []));
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    state,
    origin,
    issuer: `${origin}/auth/v1`,
    jwksUrl: new URL(`${origin}/auth/v1/.well-known/jwks.json`),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

type Double = Awaited<ReturnType<typeof startSupabaseDouble>>;

interface MintOptions {
  signer: Signer;
  issuer: string;
  alg?: string;
  audience?: string | string[];
  subject?: string | null;
  claims?: Record<string, unknown>;
  expiresIn?: number | string;
  notBefore?: number | string;
}

async function mint({ signer, issuer, alg = "ES256", audience = "authenticated", subject = editorId, claims = {}, expiresIn = "10m", notBefore }: MintOptions) {
  const jwt = new SignJWT({ role: "authenticated", client_id: clientId, ...claims })
    .setProtectedHeader({ alg, kid: signer.kid, typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn);
  if (subject !== null) jwt.setSubject(subject);
  if (notBefore !== undefined) jwt.setNotBefore(notBefore);
  return jwt.sign(signer.privateKey);
}

let signer: Signer;
let otherSigner: Signer;
const doubles: Double[] = [];

beforeAll(async () => {
  signer = await newSigner("key-1");
  otherSigner = await newSigner("key-1"); // same kid, different key material
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(doubles.splice(0).map((double) => double.close()));
});

async function supabase() {
  const double = await startSupabaseDouble();
  doubles.push(double);
  double.state.keys = [signer.publicJwk];
  double.state.profiles.set(editorId, { author_id: editorAuthorId, role: "editor" });
  double.state.profiles.set(adminId, { author_id: editorAuthorId, role: "admin" });
  double.state.profiles.set(readerId, { author_id: editorAuthorId, role: "reader" });
  return double;
}

const verifierFor = (double: Double, audience: string | null = null) =>
  createAccessTokenVerifier({ issuer: double.issuer, jwksUrl: double.jwksUrl, audience, jwksCooldownMs: 0 });

describe("Supabase access tokens", () => {
  it("accepts a token that Supabase issued to an OAuth client", async () => {
    const double = await supabase();
    const verify = verifierFor(double);
    await expect(verify(await mint({ signer, issuer: double.issuer }))).resolves.toEqual({ subject: editorId, clientId });
  });

  it("rejects everything that is not a valid token for this project", async () => {
    const double = await supabase();
    const verify = verifierFor(double);
    const issuer = double.issuer;
    const valid = await mint({ signer, issuer });
    const [header, payload] = valid.split(".");
    const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

    const rejected: Record<string, string> = {
      "wrong issuer": await mint({ signer, issuer: "https://other.supabase.co/auth/v1" }),
      "wrong audience": await mint({ signer, issuer, audience: "https://another-api.example.com" }),
      expired: await mint({ signer, issuer, expiresIn: Math.floor(Date.now() / 1000) - 600 }),
      "not yet valid": await mint({ signer, issuer, notBefore: Math.floor(Date.now() / 1000) + 3600 }),
      "bad signature": await mint({ signer: { ...otherSigner, kid: signer.kid }, issuer }),
      "unknown key id": await mint({ signer: { ...signer, kid: "key-unknown" }, issuer }),
      "alg none": `${base64url({ alg: "none", typ: "JWT", kid: signer.kid })}.${payload}.`,
      "tampered payload": `${header}.${base64url({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), sub: adminId })}.${valid.split(".")[2]}`,
      "HS256 with a shared secret": await new SignJWT({ client_id: clientId })
        .setProtectedHeader({ alg: "HS256", kid: signer.kid })
        .setIssuer(issuer).setAudience("authenticated").setSubject(editorId).setExpirationTime("10m")
        .sign(new TextEncoder().encode("a-shared-secret-of-sufficient-length-32")),
      "no subject": await mint({ signer, issuer, subject: null }),
      "subject that is not a uuid": await mint({ signer, issuer, subject: "1;drop table profiles" }),
      "session token without an OAuth client": await mint({ signer, issuer, claims: { client_id: undefined } }),
      "anonymous user": await mint({ signer, issuer, claims: { is_anonymous: true } }),
      "not a JWT": "not-a-token",
      "oversized": "a.".repeat(5000) + "a",
    };
    for (const [name, token] of Object.entries(rejected)) {
      await expect(verify(token), name).resolves.toBeNull();
    }
  });

  it("accepts only the listed OAuth clients when a client allowlist is set", async () => {
    const double = await supabase();
    const issuer = double.issuer;
    const verify = (clientIds: string[] | null) => createAccessTokenVerifier({
      issuer, jwksUrl: double.jwksUrl, audience: null, jwksCooldownMs: 0, clientIds,
    });
    const token = await mint({ signer, issuer });
    await expect(verify([clientId])(token)).resolves.toMatchObject({ subject: editorId, clientId });
    await expect(verify(["11111111-2222-4333-8444-555555555555"])(token)).resolves.toBeNull();
    // Unset: any client of the project, the behaviour before the allowlist existed.
    await expect(verify(null)(token)).resolves.toMatchObject({ clientId });
  });

  it("can require the MCP resource as audience", async () => {
    const double = await supabase();
    const resource = "https://mcp.news.example.com/mcp";
    const verify = verifierFor(double, resource);
    await expect(verify(await mint({ signer, issuer: double.issuer, audience: resource }))).resolves.toMatchObject({ subject: editorId });
    await expect(verify(await mint({ signer, issuer: double.issuer }))).resolves.toBeNull();
  });

  it("picks up a rotated signing key from the JWKS", async () => {
    const double = await supabase();
    const verify = verifierFor(double);
    const rotated = await newSigner("key-2");
    const token = await mint({ signer: rotated, issuer: double.issuer });

    await expect(verify(token)).resolves.toBeNull();
    double.state.keys = [signer.publicJwk, rotated.publicJwk];
    await expect(verify(token)).resolves.toMatchObject({ subject: editorId });
    // The previous key keeps working until it is revoked.
    await expect(verify(await mint({ signer, issuer: double.issuer }))).resolves.toMatchObject({ subject: editorId });
    // A revoked key leaves the cache with the cached key set, at the latest after ten minutes.
    double.state.keys = [rotated.publicJwk];
    await expect(verifierFor(double)(await mint({ signer, issuer: double.issuer }))).resolves.toBeNull();
  });

  it("does not reload the key set for every token with an unknown key id", async () => {
    const double = await supabase();
    const verify = createAccessTokenVerifier({ issuer: double.issuer, jwksUrl: double.jwksUrl, audience: null });
    const stranger = await newSigner("key-stranger");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(verify(await mint({ signer: stranger, issuer: double.issuer }))).resolves.toBeNull();
    }
    expect(double.state.jwksHits).toBe(1);
  });

  it("reports an unreachable key set as an error, not as an invalid token", async () => {
    const double = await supabase();
    double.state.jwksStatus = 503;
    await expect(verifierFor(double)(await mint({ signer, issuer: double.issuer }))).rejects.toThrow();
  });
});

describe("editors", () => {
  async function bearer(double: Double, subject: string) {
    const editors = supabaseEditorDirectory({ url: double.origin, serviceRoleKey });
    const verifier = supabaseOAuthVerifier(
      { issuer: double.issuer, jwksUrl: double.jwksUrl, audience: null, jwksCooldownMs: 0 },
      editors,
    );
    return verifier.verify(await mint({ signer, issuer: double.issuer, subject }), { resource: "http://localhost/mcp" });
  }

  it("gives a signed-in editor the editorial scopes and an admin also newsroom.admin, with their author id", async () => {
    const double = await supabase();
    const editorial = scopes.filter((scope) => scope !== "newsroom.admin");
    expect(scopesForRole("editor")).toEqual(editorial);
    await expect(bearer(double, editorId)).resolves.toEqual({ subject: editorId, scopes: editorial, authorId: editorAuthorId });
    await expect(bearer(double, adminId)).resolves.toEqual({ subject: adminId, scopes, authorId: editorAuthorId });
  });

  it("gives a signed-in person without an editor profile no newsroom scope", async () => {
    const double = await supabase();
    await expect(bearer(double, readerId)).resolves.toEqual({ subject: readerId, scopes: [] });
    await expect(bearer(double, "44444444-4444-4444-8444-444444444444")).resolves.toEqual({
      subject: "44444444-4444-4444-8444-444444444444",
      scopes: [],
    });
  });

  it("reads the profile with the service-role key and only for well-formed ids", async () => {
    const double = await supabase();
    const editors = supabaseEditorDirectory({ url: `${double.origin}/`, serviceRoleKey });
    await expect(editors.find("x&select=*")).resolves.toBeNull();
    expect(double.state.profileHits).toBe(0);
    await expect(editors.find(editorId)).resolves.toEqual({ authorId: editorAuthorId, role: "editor" });
    expect(double.state.authorization).toEqual([`Bearer ${serviceRoleKey}`]);
  });

  it("reuses an answer for a short time and then asks again, so removing an editor takes effect", async () => {
    const double = await supabase();
    let time = 1_000;
    const editors = supabaseEditorDirectory({ url: double.origin, serviceRoleKey, cacheMs: 30_000, now: () => time });
    await editors.find(editorId);
    await editors.find(editorId);
    expect(double.state.profileHits).toBe(1);

    double.state.profiles.delete(editorId);
    time += 30_001;
    await expect(editors.find(editorId)).resolves.toBeNull();
    expect(double.state.profileHits).toBe(2);
  });

  it("fails the request, rather than demoting the caller, when the profile source is down", async () => {
    const editors = supabaseEditorDirectory({
      url: "http://127.0.0.1:9",
      serviceRoleKey,
      fetch: async () => new Response("down", { status: 500 }),
    });
    await expect(editors.find(editorId)).rejects.toThrow(/500/);
  });
});

describe("the configured server", () => {
  async function configure() {
    const double = await supabase();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", double.origin);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey);
    vi.stubEnv("NEXT_PUBLIC_MCP_URL", "http://localhost:8787");
    vi.stubEnv("ATLASNEWS_MCP_ADMIN_API_KEY", testApiKey);
    vi.stubEnv("ATLASNEWS_CONTENT_MODE", "demo");
    return double;
  }

  async function call(authorization: string | undefined) {
    const response = await handleMcpRequest(
      rpcRequest(
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: modernParams({ name: "admin_list_articles", arguments: { locale: "en" } }) },
        undefined,
        authorization,
      ),
      { verifier: defaultAccessTokenVerifier(), createPorts: () => memoryPorts() },
    );
    return { response, payload: await response.json() };
  }

  it("runs editor tools for a signed-in editor and refuses them to anyone else", async () => {
    const double = await configure();
    const editor = await call(`Bearer ${await mint({ signer, issuer: double.issuer })}`);
    expect(editor.response.status).toBe(200);
    expect(editor.payload.result.isError).not.toBe(true);
    expect(editor.payload.result.structuredContent.items.length).toBeGreaterThan(0);
    expect(editor.response.headers.get("cache-control")).toBe("no-store");
    expect(editor.response.headers.get("access-control-allow-origin")).toBeNull();

    const reader = await call(`Bearer ${await mint({ signer, issuer: double.issuer, subject: readerId })}`);
    expect(reader.response.status).toBe(200);
    expect(reader.payload.result.isError).toBe(true);
    expect(reader.payload.result.content[0].text).toContain("newsroom.read");
    expect(reader.payload.result.structuredContent).toBeUndefined();
  });

  it("answers an invalid token with 401 and a challenge that points at the resource metadata", async () => {
    const double = await configure();
    const bad = await call(`Bearer ${await mint({ signer: otherSigner, issuer: double.issuer })}`);
    expect(bad.response.status).toBe(401);
    const challenge = bad.response.headers.get("www-authenticate");
    expect(challenge).toContain('resource_metadata="http://localhost:8787/.well-known/oauth-protected-resource"');
    expect(challenge).toContain('error="invalid_token"');
  });

  it("answers 401 for an editor's token from a client that is not on ATLASNEWS_MCP_OAUTH_CLIENT_IDS", async () => {
    const double = await configure();
    vi.stubEnv("ATLASNEWS_MCP_OAUTH_CLIENT_IDS", "11111111-2222-4333-8444-555555555555");
    const refused = await call(`Bearer ${await mint({ signer, issuer: double.issuer })}`);
    expect(refused.response.status).toBe(401);

    vi.stubEnv("ATLASNEWS_MCP_OAUTH_CLIENT_IDS", `11111111-2222-4333-8444-555555555555, ${clientId}`);
    const accepted = await call(`Bearer ${await mint({ signer, issuer: double.issuer })}`);
    expect(accepted.response.status).toBe(200);
    expect(accepted.payload.result.isError).not.toBe(true);
  });

  it("offers no sign-in while the public MCP origin is not configured, rather than trust the Host header", async () => {
    const double = await configure();
    vi.stubEnv("NEXT_PUBLIC_MCP_URL", "");
    const token = await mint({ signer, issuer: double.issuer });
    expect((await call(`Bearer ${token}`)).response.status).toBe(401);

    const hostile = new Request("http://evil.example/.well-known/oauth-protected-resource", { headers: { host: "evil.example" } });
    expect((await getResourceMetadata(hostile)).status).toBe(404);
    expect((await call(`Bearer ${testApiKey}`)).payload.result.isError).not.toBe(true);
    expect((await call(`Bearer ${testApiKey}`)).payload.result.isError).not.toBe(true);
  });

  it("keeps the API key working after the OAuth verifier, and anonymous reads unaffected", async () => {
    await configure();
    const key = await call(`Bearer ${testApiKey}`);
    expect(key.payload.result.isError).not.toBe(true);
    const anonymousRead = await handleMcpRequest(
      rpcRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: modernParams({ name: "list_articles", arguments: {} }) }),
      { verifier: defaultAccessTokenVerifier(), createPorts: () => memoryPorts() },
    );
    expect((await anonymousRead.json()).result.isError).not.toBe(true);
  });

  it("answers 500 rather than 401 when the key set is unreachable", async () => {
    const double = await configure();
    double.state.keys = [];
    double.state.jwksStatus = 503;
    const { response } = await call(`Bearer ${await mint({ signer, issuer: double.issuer })}`);
    expect(response.status).toBe(500);
  });

  it("carries the editor's author id into the principal", async () => {
    const double = await configure();
    const request = rpcRequest({}, undefined, `Bearer ${await mint({ signer, issuer: double.issuer })}`);
    await expect(resolvePrincipal(request, defaultAccessTokenVerifier())).resolves.toEqual({
      kind: "editor",
      subject: editorId,
      scopes: scopesForRole("editor"),
      authorId: editorAuthorId,
    });
  });

  it("lists the authorization server first in the resource metadata and only offers scopes it can grant", async () => {
    const double = await configure();
    vi.stubEnv("NEXT_PUBLIC_MCP_URL", "https://mcp.news.example.com");
    const metadata = await getResourceMetadata(new Request("http://10.0.0.7:8787/.well-known/oauth-protected-resource")).json();
    expect(metadata).toEqual({
      resource: "https://mcp.news.example.com/mcp",
      authorization_servers: [double.issuer],
      scopes_supported: ["email"],
      bearer_methods_supported: ["header"],
    });
    const challenge = bearerChallenge(new Request("http://10.0.0.7:8787/mcp"), {
      error: "insufficient_scope",
      description: "x",
      scope: ["newsroom.publish"],
    });
    expect(challenge).toContain('resource_metadata="https://mcp.news.example.com/.well-known/oauth-protected-resource"');
    expect(challenge).toContain('scope="email"');
  });

  it("falls back to the API key alone, and publishes no resource metadata, when sign-in is not configured", async () => {
    await configure();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const metadata = await getResourceMetadata(new Request("http://localhost:8787/.well-known/oauth-protected-resource"));
    expect(metadata.status).toBe(404);

    const verifier = defaultAccessTokenVerifier();
    const jwtLooking = "aaa.bbb.ccc";
    await expect(resolvePrincipal(rpcRequest({}, undefined, `Bearer ${jwtLooking}`), verifier)).rejects.toBeInstanceOf(Unauthorized);
    await expect(resolvePrincipal(rpcRequest({}, undefined, `Bearer ${testApiKey}`), verifier)).resolves.toMatchObject({ subject: "mcp-admin" });
  });
});
