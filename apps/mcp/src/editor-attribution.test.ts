import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { defaultAccessTokenVerifier } from "./auth";
import { handleMcpRequest } from "./http";
import { modernParams, rpcRequest, testApiKey } from "./mcp-test-client";
import { createRuntimePorts } from "./runtime-ports";

const editorId = "11111111-1111-4111-8111-111111111111";
const editorAuthorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const apiKeyAuthorId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const savedArticleId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const clientId = "9a8b7c6d-5e4f-4a2b-9c0d-9e8f7a6b5c4d";
const serviceRoleKey = "s".repeat(40);

/** Supabase as far as the server talks to it: JWKS, the editor profile, and the article write path. */
async function startSupabaseDouble(publicKey: JWK) {
  const savedBy: unknown[] = [];
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const json = (body: unknown) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(body));
    };
    const wantsObject = String(request.headers.accept).includes("vnd.pgrst.object");
    let chunks = "";
    request.on("data", (chunk) => (chunks += chunk));
    request.on("end", () => {
      if (url.pathname === "/auth/v1/.well-known/jwks.json") return json({ keys: [publicKey] });
      if (url.pathname === "/rest/v1/profiles") return json([{ author_id: editorAuthorId, role: "editor" }]);
      if (url.pathname === "/rest/v1/categories") return json(wantsObject ? { id: "category-1" } : [{ id: "category-1" }]);
      if (url.pathname === "/rest/v1/rpc/save_article_with_distribution") {
        savedBy.push(JSON.parse(chunks).p_author_id);
        return json(savedArticleId);
      }
      if (url.pathname === "/rest/v1/articles") {
        return json({
          id: savedArticleId, translation_key: "key-1", locale: "en", slug: "written-by-an-editor",
          title: "Written by an editor", excerpt: "x", content: "x", cover_image: "/c.webp", cover_alt: "c",
          status: "draft", featured: false, reading_minutes: 1, published_at: null, scheduled_for: null,
          created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
          category: { id: "category-1", translation_key: "research", locale: "en", slug: "research", name: "Research", description: null },
          author: { id: editorAuthorId, name: "Author", role: "Editor", initials: "AU", avatar_url: null },
          distribution: [], claim_status: "analysis", key_points: [], sources: [], entities: [],
        });
      }
      response.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { origin, issuer: `${origin}/auth/v1`, savedBy, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

let privateKey: CryptoKey;
let publicJwk: JWK;
let double: Awaited<ReturnType<typeof startSupabaseDouble>> | undefined;

beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: "key-1", alg: "ES256", use: "sig" };
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await double?.close();
  double = undefined;
});

async function configure() {
  double = await startSupabaseDouble(publicJwk);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", double.origin);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey);
  vi.stubEnv("ATLASNEWS_CONTENT_MODE", "supabase");
  vi.stubEnv("NEXT_PUBLIC_MCP_URL", "");
  vi.stubEnv("ATLASNEWS_MCP_ADMIN_API_KEY", testApiKey);
  vi.stubEnv("ATLASNEWS_MCP_ADMIN_AUTHOR_ID", apiKeyAuthorId);
  return double;
}

async function createArticle(authorization: string) {
  const response = await handleMcpRequest(
    rpcRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: modernParams({
        name: "admin_create_article",
        arguments: {
          locale: "en",
          title: "Written by an editor",
          excerpt: "An article that proves who the write is attributed to.",
          content: "This article is long enough for the newsroom validation and exists only to prove attribution of writes.",
          categorySlug: "research",
        },
      }),
    }, undefined, authorization),
    { verifier: defaultAccessTokenVerifier(), createPorts: createRuntimePorts },
  );
  return { response, payload: await response.json() };
}

describe("who a write is attributed to", () => {
  it("records a signed-in editor's own author, not the one configured for the API key", async () => {
    const { issuer, savedBy } = await configure();
    const token = await new SignJWT({ role: "authenticated", client_id: clientId })
      .setProtectedHeader({ alg: "ES256", kid: "key-1", typ: "JWT" })
      .setIssuer(issuer).setAudience("authenticated").setSubject(editorId).setIssuedAt().setExpirationTime("10m")
      .sign(privateKey);

    const { response, payload } = await createArticle(`Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(payload.result.isError).not.toBe(true);
    expect(savedBy).toEqual([editorAuthorId]);
    expect(payload.result.structuredContent.article.id).toBe(savedArticleId);
  });

  it("keeps attributing the API key to ATLASNEWS_MCP_ADMIN_AUTHOR_ID", async () => {
    const { savedBy } = await configure();

    const { response, payload } = await createArticle(`Bearer ${testApiKey}`);

    expect(response.status).toBe(200);
    expect(payload.result.isError).not.toBe(true);
    expect(savedBy).toEqual([apiKeyAuthorId]);
  });
});
