import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createSitesTestStore, type SitesTestStore } from "@atlasnews/adapters/sites/testing";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  supabaseClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers, cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath, revalidateTag: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.supabaseClient }));

import { getEditorIdentity, getSignedInUser, isSignedIn } from "./editor-auth";
import { runEditorCapability } from "@/server/capabilities";

// The trust boundary of the `oai-authenticated-*` headers: they identify a visitor on ChatGPT Sites and
// nowhere else, and the owner can switch them off (`ATLASNEWS_CHATGPT_SIGN_IN=off`).

const adminEmail = "owner@example.com";
/** What a client that forges the headers sends, or what the platform injects for a signed-in visitor. */
const identityHeaders = () => new Headers({
  "oai-authenticated-user-id": "probe",
  "oai-authenticated-user-email": adminEmail,
});

let store: SitesTestStore;
beforeAll(async () => {
  store = await createSitesTestStore({ register: true });
});
afterAll(() => store.dispose());

beforeEach(() => {
  vi.stubEnv("ATLASNEWS_ADMIN_EMAILS", adminEmail);
  vi.stubEnv("ATLASNEWS_EDITOR_EMAILS", "");
  // A production build, where the demo Studio is off; an anonymous Supabase visitor.
  vi.stubEnv("NODE_ENV", "production");
  mocks.headers.mockReset().mockImplementation(async () => identityHeaders());
  mocks.supabaseClient.mockReset().mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } });
});

afterEach(() => vi.unstubAllEnvs());

describe("identity headers in sites mode", () => {
  it("sign in the account they name, and a listed admin is a Studio editor", async () => {
    vi.stubEnv("ATLASNEWS_CONTENT_MODE", "sites");
    expect(await getSignedInUser()).toMatchObject({ userId: "probe", email: adminEmail, provider: "chatgpt" });
    expect(await getEditorIdentity()).toMatchObject({ userId: "probe", role: "admin", isDemo: false });
    expect(await isSignedIn()).toBe(true);
  });

  it("are ignored while the owner has switched ChatGPT sign-in off", async () => {
    vi.stubEnv("ATLASNEWS_CONTENT_MODE", "sites");
    vi.stubEnv("ATLASNEWS_CHATGPT_SIGN_IN", "off");
    expect(await getSignedInUser()).toBeNull();
    expect(await getEditorIdentity()).toBeNull();
    expect(await isSignedIn()).toBe(false);
    // `/api/capabilities/*` and the Studio's Server Actions answer 401, not 403: nobody is signed in.
    expect(await runEditorCapability("list_entities", { locale: "en" })).toMatchObject({ ok: false, status: 401 });
  });
});

describe.each(["demo", "supabase"])("identity headers in %s mode", (mode) => {
  it("are never read: the visitor is anonymous for the Studio and its capabilities", async () => {
    vi.stubEnv("ATLASNEWS_CONTENT_MODE", mode);
    expect(await getSignedInUser()).toBeNull();
    expect(await getEditorIdentity()).toBeNull();
    expect(await isSignedIn()).toBe(false);
    expect(mocks.headers).not.toHaveBeenCalled();
    expect(await runEditorCapability("list_entities", { locale: "en" })).toMatchObject({ ok: false, status: 401 });
  });
});
