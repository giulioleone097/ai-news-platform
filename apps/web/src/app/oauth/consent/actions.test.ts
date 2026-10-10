import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw new Error(`redirect:${url}`);
});
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "accept-language": "en" }) }));

const approveAuthorization = vi.fn();
const denyAuthorization = vi.fn();
const getAuthorizationDetails = vi.fn();
const client = {
  auth: {
    getUser: async () => ({ data: { user: { id: "user-1" } } }),
    oauth: { approveAuthorization, denyAuthorization, getAuthorizationDetails },
  },
  from: () => ({
    select: () => ({ eq: () => ({ in: () => ({ maybeSingle: async () => ({ data: { role: "editor" } }) }) }) }),
  }),
};
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => client }));

const { decideAuthorization } = await import("./actions");
const idle = { status: "idle" } as never;
const decide = (decision: "approve" | "deny") => {
  const form = new FormData();
  form.set("authorizationId", "auth-request-0001");
  form.set("decision", decision);
  return decideAuthorization(idle, form);
};
const details = (redirectUri: string) => ({
  data: { authorization_id: "auth-request-0001", redirect_uri: redirectUri, client: { name: "Anything" }, scope: "email", user: { email: "e@x.test" } },
  error: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  approveAuthorization.mockResolvedValue({ data: { redirect_url: "https://claude.ai/api/mcp/auth_callback?code=c" }, error: null });
  denyAuthorization.mockResolvedValue({ data: { redirect_url: "https://attacker.example/cb?error=access_denied" }, error: null });
});

describe("decideAuthorization", () => {
  it("approves a client that returns to an allowed host", async () => {
    getAuthorizationDetails.mockResolvedValue(details("https://claude.ai/api/mcp/auth_callback"));
    await expect(decide("approve")).rejects.toThrow("redirect:https://claude.ai/api/mcp/auth_callback?code=c");
    expect(approveAuthorization).toHaveBeenCalledOnce();
  });

  it("refuses to approve a client that returns to any other host, whatever name it gave itself", async () => {
    getAuthorizationDetails.mockResolvedValue(details("https://claude.ai.attacker.example/cb"));
    const result = await decide("approve");
    expect(result).toMatchObject({ status: "error" });
    expect(result.message).toContain("claude.ai.attacker.example");
    expect(approveAuthorization).not.toHaveBeenCalled();
  });

  it("follows ATLASNEWS_OAUTH_REDIRECT_HOSTS when an operator sets it", async () => {
    vi.stubEnv("ATLASNEWS_OAUTH_REDIRECT_HOSTS", "mcp-client.example.com");
    getAuthorizationDetails.mockResolvedValue(details("https://claude.ai/api/mcp/auth_callback"));
    expect(await decide("approve")).toMatchObject({ status: "error" });
    getAuthorizationDetails.mockResolvedValue(details("https://mcp-client.example.com/cb"));
    approveAuthorization.mockResolvedValue({ data: { redirect_url: "https://mcp-client.example.com/cb?code=c" }, error: null });
    await expect(decide("approve")).rejects.toThrow("redirect:https://mcp-client.example.com/cb?code=c");
  });

  it("lets the editor cancel any request", async () => {
    await expect(decide("deny")).rejects.toThrow("redirect:https://attacker.example/cb?error=access_denied");
    expect(getAuthorizationDetails).not.toHaveBeenCalled();
  });
});
