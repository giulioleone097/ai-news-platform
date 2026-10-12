import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  editor: vi.fn(),
  signedIn: vi.fn(),
  invalidate: vi.fn(),
  revalidatePath: vi.fn(),
  repository: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath, revalidateTag: vi.fn() }));
vi.mock("@/lib/editor-auth", () => ({ getEditorIdentity: mocks.editor, isSignedIn: mocks.signedIn }));
vi.mock("@/lib/editorial-cache", () => ({ invalidatePublicEditorialCache: mocks.invalidate }));
// The real composition root and catalogue run; only the Studio repository can be swapped to fail.
vi.mock("@/server/composition", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/composition")>();
  mocks.repository.mockImplementation(actual.getStudioAdminEditorialRepository);
  return { ...actual, getStudioAdminEditorialRepository: mocks.repository };
});

import { getMessages } from "@/i18n";
import { runEditorCapability } from "./capabilities";

const identity = (role: string) => ({ userId: "u1", role, author: {}, isDemo: true });
const entity = { kind: "company", name: "Capability Test Lab", slug: "capability-test-lab" };

beforeEach(async () => {
  vi.stubEnv("ATLASNEWS_CONTENT_MODE", "demo");
  mocks.editor.mockReset().mockResolvedValue(identity("editor"));
  mocks.signedIn.mockReset().mockResolvedValue(false);
  mocks.invalidate.mockClear();
  mocks.revalidatePath.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  // Leave no entity behind in the shared in-memory repository.
  await runEditorCapability("admin_delete_entity", { slug: entity.slug }, { confirmed: true });
  mocks.invalidate.mockClear();
  mocks.revalidatePath.mockClear();
  mocks.repository.mockClear();
});

describe("runEditorCapability statuses", () => {
  it("answers 401 when nobody is signed in", async () => {
    mocks.editor.mockResolvedValue(null);
    expect(await runEditorCapability("list_entities", { locale: "en" })).toMatchObject({ ok: false, status: 401 });
  });

  it("answers 403, not 401, to a signed-in account that has no editor profile", async () => {
    mocks.editor.mockResolvedValue(null);
    mocks.signedIn.mockResolvedValue(true);
    expect(await runEditorCapability("list_entities", { locale: "en" })).toMatchObject({ ok: false, status: 403 });
    expect(mocks.repository).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown capability and for one that is not offered to the page", async () => {
    expect(await runEditorCapability("no_such_capability", {})).toMatchObject({ ok: false, status: 404 });
    expect(await runEditorCapability("admin_comment_process_notifications", {})).toMatchObject({ ok: false, status: 404 });
    expect(await runEditorCapability("admin_social_process_outbox", {}, { confirmed: true })).toMatchObject({ ok: false, status: 404 });
    expect(await runEditorCapability("__proto__", {})).toMatchObject({ ok: false, status: 404 });
  });

  it("answers 403 without the scope and never runs the handler", async () => {
    mocks.editor.mockResolvedValue(identity("reader"));
    expect(await runEditorCapability("admin_create_entity", entity)).toMatchObject({ ok: false, status: 403 });
    expect(mocks.repository).not.toHaveBeenCalled();
    // A capability that needs no scope still runs.
    expect(await runEditorCapability("list_entities", { locale: "en" })).toMatchObject({ ok: true });
  });

  it("derives the same scopes for editors and admins", async () => {
    for (const role of ["editor", "admin"]) {
      mocks.editor.mockResolvedValue(identity(role));
      expect(await runEditorCapability("admin_get_entity", { slug: "claude" })).not.toMatchObject({ status: 403 });
    }
  });

  it("answers 400 with the message of invalid arguments", async () => {
    const result = await runEditorCapability("admin_create_entity", { kind: "nonsense" });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(result.ok ? "" : result.error).toContain("Invalid arguments for admin_create_entity");
    expect(await runEditorCapability("admin_create_entity", "text")).toMatchObject({ ok: false, status: 400 });
  });

  it("answers 400 with the capability's own message when a rule refuses", async () => {
    expect(await runEditorCapability("admin_get_entity", { slug: "does-not-exist" })).toEqual({
      ok: false,
      status: 400,
      error: "Entity not found.",
      code: "entity.notFound",
    });
  });

  it("answers 503 with a safe message when storage cannot be reached", async () => {
    mocks.repository.mockRejectedValueOnce(new Error("secret connection string postgres://user:pw@host"));
    const result = await runEditorCapability("admin_get_entity", { slug: "claude" });
    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(JSON.stringify(result)).not.toContain("postgres");
  });
});

describe("operations capabilities", () => {
  it("run for an editor, over the same stores and rules as the Studio screens", async () => {
    const listed = await runEditorCapability("admin_list_distribution", { locale: "en" });
    expect(listed).toMatchObject({ ok: true });
    expect(listed.ok && Array.isArray(listed.result.items)).toBe(true);
    expect(await runEditorCapability("admin_list_contact_messages", {})).toMatchObject({ ok: true, result: { items: [] } });
    expect(await runEditorCapability("admin_list_newsletter_subscriptions", { locale: "en" })).toMatchObject({
      ok: true,
      result: { contentTrust: { source: "anonymous-visitors" } },
    });
  });

  it("are refused to an account without the scope, before any handler or store is reached", async () => {
    mocks.editor.mockResolvedValue(identity("reader"));
    for (const [name, input] of [
      ["admin_list_distribution", { locale: "en" }],
      ["admin_list_comments", {}],
      ["admin_list_contact_messages", {}],
      ["admin_newsletter_list_campaigns", { locale: "en" }],
      ["admin_social_list", {}],
    ] as const) {
      expect(await runEditorCapability(name, input), name).toMatchObject({ ok: false, status: 403 });
    }
    expect(mocks.repository).not.toHaveBeenCalled();
  });

  it("ask first before they moderate, delete, send or post", async () => {
    const comment = "6f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e6f";
    expect(await runEditorCapability("admin_moderate_comment", { id: comment, status: "spam", reason: "Advertising." }))
      .toEqual({ ok: false, status: 409, error: `Mark comment ${comment} as spam?` });
    expect(await runEditorCapability("admin_delete_contact_message", { id: comment })).toMatchObject({ status: 409 });
    expect(await runEditorCapability("admin_newsletter_send_campaign", { id: comment })).toMatchObject({ status: 409 });
  });

  it("answer 503 with the capability's own message, not a crash, when the backend is not configured", async () => {
    for (const [name, input, message] of [
      ["admin_list_comments", {}, "The operational service is not configured or the request could not be completed."],
      ["admin_newsletter_list_campaigns", { locale: "en" }, "The operational service is not configured or the request could not be completed."],
    ] as const) {
      expect(await runEditorCapability(name, input), name).toEqual({ ok: false, status: 503, error: message });
    }
  });

  it("answer 503 with a code when the social outbox is not configured, so a screen can say so", async () => {
    expect(await runEditorCapability("admin_social_list", {})).toEqual({
      ok: false,
      status: 503,
      error: "Social outbox persistence is not configured.",
      code: "social.notConfigured",
    });
  });
});

describe("the language of a refusal", () => {
  it("is English for agents and the editor's own language for a Studio screen, with no raw English left", async () => {
    mocks.editor.mockResolvedValue(null);
    expect(await runEditorCapability("list_entities", { locale: "it" })).toMatchObject({
      error: "Sign in to the Studio with an editor account.",
    });
    expect(await runEditorCapability("list_entities", { locale: "it" }, { locale: "it" })).toEqual({
      ok: false,
      status: 401,
      error: getMessages("it").studio.refusals.signIn,
    });

    mocks.signedIn.mockResolvedValue(true);
    expect(await runEditorCapability("list_entities", { locale: "it" }, { locale: "it" })).toMatchObject({
      status: 403,
      error: getMessages("it").studio.refusals.notEditor,
    });
  });

  it("names no Zod wording for invalid arguments, and the rule's text for a refused rule", async () => {
    mocks.editor.mockResolvedValue(identity("editor"));
    const invalid = await runEditorCapability("admin_create_entity", { kind: "nonsense" }, { locale: "it" });
    expect(invalid).toEqual({ ok: false, status: 400, error: getMessages("it").studio.refusals.invalidInput });

    expect(await runEditorCapability("admin_get_entity", { slug: "does-not-exist" }, { locale: "it" })).toEqual({
      ok: false,
      status: 400,
      error: getMessages("it").studio.ruleErrors["entity.notFound"],
      code: "entity.notFound",
    });
  });

  it("asks for confirmation and reports an unreachable store in the editor's language", async () => {
    expect(await runEditorCapability("admin_delete_entity", { slug: entity.slug }, { locale: "it" })).toEqual({
      ok: false,
      status: 409,
      error: getMessages("it").studio.refusals.needsConfirmation,
    });
    mocks.repository.mockRejectedValueOnce(new Error("secret connection string postgres://user:pw@host"));
    expect(await runEditorCapability("admin_get_entity", { slug: "claude" }, { locale: "it" })).toEqual({
      ok: false,
      status: 503,
      error: getMessages("it").studio.refusals.unavailable,
    });
  });
});

describe("confirmation", () => {
  it("asks first and changes nothing until the call is confirmed", async () => {
    await runEditorCapability("admin_create_entity", entity);
    mocks.invalidate.mockClear();

    for (const options of [undefined, {}, { confirmed: false }, { confirmed: "true" as unknown as boolean }]) {
      expect(await runEditorCapability("admin_delete_entity", { slug: entity.slug }, options)).toEqual({
        ok: false,
        status: 409,
        error: "Permanently delete the entity “capability-test-lab”?",
      });
    }
    expect(await runEditorCapability("admin_get_entity", { slug: entity.slug })).toMatchObject({ ok: true });
    expect(mocks.invalidate).not.toHaveBeenCalled();

    expect(await runEditorCapability("admin_delete_entity", { slug: entity.slug }, { confirmed: true })).toEqual({
      ok: true,
      result: { deletedSlug: entity.slug },
    });
    expect(await runEditorCapability("admin_get_entity", { slug: entity.slug })).toMatchObject({ status: 400 });
  });

  it("checks scope and input before it asks", async () => {
    mocks.editor.mockResolvedValue(identity("reader"));
    expect(await runEditorCapability("admin_delete_entity", { slug: "claude" })).toMatchObject({ status: 403 });
    mocks.editor.mockResolvedValue(identity("editor"));
    expect(await runEditorCapability("admin_delete_entity", { slug: "" })).toMatchObject({ status: 400 });
  });
});

describe("cache refresh", () => {
  it("refreshes every locale once after a write, and the Studio screens", async () => {
    expect(await runEditorCapability("admin_create_entity", entity)).toMatchObject({ ok: true });

    expect(mocks.invalidate.mock.calls).toEqual([
      [{ locale: "en", slugs: [] }],
      [{ locale: "it", slugs: [] }],
    ]);
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual(
      ["en", "it"].flatMap((locale) =>
        ["", "/articles", "/entities", "/categories", "/media"].map((section) => `/${locale}/studio${section}`)),
    );
  });

  it("does not refresh after a read or a refused write", async () => {
    await runEditorCapability("list_entities", { locale: "en" });
    await runEditorCapability("admin_update_entity", { slug: "does-not-exist", name: "Nope" });
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps a saved write successful when the refresh itself fails", async () => {
    mocks.invalidate.mockImplementationOnce(() => {
      throw new Error("no request scope");
    });
    expect(await runEditorCapability("admin_create_entity", entity)).toMatchObject({ ok: true });
  });
});

describe("entities end to end on the in-memory repository", () => {
  it("creates, patches, lists and deletes an entity", async () => {
    const created = await runEditorCapability("admin_create_entity", {
      ...entity,
      officialUrl: "https://example.com",
      descriptions: { en: "A lab used only by the capability tests." },
    });
    expect(created).toMatchObject({ ok: true, result: { entity: { slug: entity.slug, name: entity.name } } });

    expect(await runEditorCapability("admin_update_entity", { slug: entity.slug, name: "Capability Test Lab 2" }))
      .toMatchObject({ ok: true, result: { entity: { slug: entity.slug, name: "Capability Test Lab 2" } } });

    const listed = await runEditorCapability("list_entities", { locale: "en", kind: "company" });
    expect(listed.ok && (listed.result.items as { slug: string; name: string }[])
      .find((item) => item.slug === entity.slug)?.name).toBe("Capability Test Lab 2");

    expect(await runEditorCapability("admin_delete_entity", { slug: entity.slug })).toMatchObject({ status: 409 });
    expect(await runEditorCapability("admin_delete_entity", { slug: entity.slug }, { confirmed: true }))
      .toEqual({ ok: true, result: { deletedSlug: entity.slug } });

    const after = await runEditorCapability("list_entities", { locale: "en", kind: "company" });
    expect(after.ok && (after.result.items as { slug: string }[]).some((item) => item.slug === entity.slug)).toBe(false);
  });
});
