import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let language = "en";
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "accept-language": language }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("./consent.css", () => ({}));
vi.mock("./actions", () => ({
  decideAuthorization: vi.fn(),
  signInForConsent: vi.fn(),
  signOutOfConsent: vi.fn(),
}));

let details: unknown;
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "u1", email: "editor@example.com" } } }),
      oauth: { getAuthorizationDetails: async () => ({ data: details, error: null }) },
    },
    from: () => ({
      select: () => ({ eq: () => ({ in: () => ({ maybeSingle: async () => ({ data: { role: "editor" } }) }) }) }),
    }),
  }),
}));

const { default: ConsentPage } = await import("./page");
const render = async () =>
  renderToStaticMarkup(await ConsentPage({ searchParams: Promise.resolve({ authorization_id: "auth-request-0001" }) }));
const pending = (redirectUri: string, name = "Claude") => ({
  authorization_id: "auth-request-0001",
  redirect_uri: redirectUri,
  client: { name, uri: "https://claude.ai" },
  scope: "email",
  user: { email: "editor@example.com" },
});

beforeEach(() => {
  language = "en";
});

describe("OAuth consent page", () => {
  it("puts the host the code goes to right under the client's name, in English and Italian", async () => {
    details = pending("https://claude.ai/api/mcp/auth_callback");
    const english = await render();
    expect(english).toContain("Allow Claude to use AtlasNews?");
    expect(english).toMatch(/After you allow it, you are sent to <strong>claude\.ai<\/strong>/);
    expect(english.indexOf("claude.ai</strong>")).toBeLessThan(english.indexOf("Signed in as"));
    expect(english).toContain("Allow access");

    language = "it";
    const italian = await render();
    expect(italian).toContain("Consentire a Claude di usare AtlasNews?");
    expect(italian).toMatch(/Dopo il consenso vieni inviato a <strong>claude\.ai<\/strong>/);
    expect(italian).toContain("Consenti l&#x27;accesso");
  });

  it("shows no way to allow a client whose redirect host is not permitted", async () => {
    details = pending("https://claude.ai.attacker.example/cb", "Claude");
    const html = await render();
    expect(html).toContain("claude.ai.attacker.example");
    expect(html).toContain("does not allow");
    expect(html).not.toContain("Allow access");
    expect(html).not.toContain('value="approve"');

    language = "it";
    expect(await render()).toContain("che questa redazione non consente");
  });

  it("does not send the browser on automatically for an earlier approval that returns to a disallowed host", async () => {
    details = { redirect_url: "https://attacker.example/cb?code=c" };
    expect(await render()).toContain("attacker.example");
    details = { redirect_url: "https://claude.ai/api/mcp/auth_callback?code=c" };
    await expect(render()).rejects.toThrow("redirect:https://claude.ai/api/mcp/auth_callback?code=c");
  });
});
