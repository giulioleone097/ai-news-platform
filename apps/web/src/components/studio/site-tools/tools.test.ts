import { describe, expect, it, vi } from "vitest";
import { editorPageCapabilities } from "@atlasnews/contract/page";
import { createConfirmPresenter, type ConfirmRequest } from "./confirm-dialog";
import { FakeDocument } from "./fake-document";
import { createEditorTools, describeAffected, type EditorToolsEnvironment } from "./tools";

interface Sent {
  url: string;
  body: { input: Record<string, unknown>; confirmed: boolean };
  init: RequestInit;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const ok = (result: Record<string, unknown> = { done: true }) => json(200, { ok: true, result });
const refused = (status: number, error: string) => json(status, { ok: false, status, error });

/** A fake route: `answer` sees each request in order. */
function setup(answer: (sent: Sent, index: number) => Response | Promise<Response>, confirm?: EditorToolsEnvironment["confirm"]) {
  const sent: Sent[] = [];
  const asked: ConfirmRequest[] = [];
  const refresh = vi.fn();
  const env: EditorToolsEnvironment = {
    fetch: async (input, init) => {
      const entry = { url: String(input), body: JSON.parse(String(init?.body)), init: init! };
      sent.push(entry);
      return answer(entry, sent.length - 1);
    },
    confirm: confirm ?? ((request) => (asked.push(request), Promise.resolve(true))),
    refresh,
  };
  return { tools: createEditorTools(env), sent, asked, refresh };
}

const deleteEntity = { slug: "openai" };

describe("editor tools: input", () => {
  it("has a handler for every capability and nothing else", () => {
    const { tools } = setup(() => ok());
    expect(Object.keys(tools)).toEqual(editorPageCapabilities.map((capability) => capability.name));
  });

  it("never sends invalid input to the server", async () => {
    const { tools, sent } = setup(() => ok());
    await expect(tools.admin_delete_entity({ slug: "Not A Slug" })).resolves.toMatchObject({
      error: expect.stringContaining("Invalid arguments for admin_delete_entity"),
    });
    await expect(tools.admin_delete_entity({})).resolves.toHaveProperty("error");
    await expect(tools.admin_delete_entity("slug")).resolves.toHaveProperty("error");
    await expect(tools.admin_create_articles({ items: [] })).resolves.toHaveProperty("error");
    expect(sent).toHaveLength(0);
  });

  it("posts the parsed input to /api/capabilities/{name} as same-origin JSON", async () => {
    const { tools, sent } = setup(() => ok({ items: [] }));
    await expect(tools.admin_list_articles({ locale: "en" })).resolves.toEqual({ items: [] });
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("/api/capabilities/admin_list_articles");
    expect(sent[0].init).toMatchObject({ method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" } });
    expect(sent[0].body).toEqual({ input: expect.any(Object), confirmed: false });
  });
});

describe("editor tools: server statuses", () => {
  const cases: [number, RegExp][] = [
    [400, /^The slug is taken\.$/],
    [401, /not signed in.*sign in again/i],
    [403, /may not use admin_update_entity.*Nothing was changed/],
    [404, /does not know the tool admin_update_entity/],
    [503, /storage is not configured/i],
    [500, /could not run admin_update_entity \(500\)/],
  ];
  it.each(cases)("maps %i to a clear error result", async (status, pattern) => {
    const { tools, refresh } = setup(() => refused(status, status === 400 ? "The slug is taken." : "No scope."));
    const result = await tools.admin_update_entity({ slug: "openai", name: "OpenAI" });
    expect(Object.keys(result)).toEqual(["error"]);
    expect(result.error).toMatch(pattern);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("answers an error, never a throw, when the network, the JSON or the shape is wrong", async () => {
    const offline = createEditorTools({ fetch: () => Promise.reject(new TypeError("offline")), confirm: async () => true, refresh: vi.fn() });
    await expect(offline.admin_list_media({})).resolves.toMatchObject({ error: expect.stringContaining("could not be reached") });

    const html = setup(() => new Response("<html>", { status: 502 }));
    await expect(html.tools.admin_list_media({})).resolves.toMatchObject({ error: expect.stringContaining("(502)") });

    const odd = setup(() => json(200, { ok: true }));
    await expect(odd.tools.admin_list_media({})).resolves.toHaveProperty("error");
  });

  it("reports a cancelled call as cancelled", async () => {
    const controller = new AbortController();
    const { tools } = setup(() => {
      controller.abort();
      return Promise.reject(new DOMException("aborted", "AbortError"));
    });
    await expect(tools.admin_list_media({}, controller.signal)).resolves.toEqual({ error: "admin_list_media was cancelled." });
  });
});

describe("editor tools: refreshing the view", () => {
  it("refreshes after a successful write, and only then", async () => {
    const { tools, refresh } = setup(() => ok());
    await tools.admin_list_articles({ locale: "en" });
    await tools.admin_get_entity({ slug: "openai" });
    expect(refresh).not.toHaveBeenCalled();

    await tools.admin_update_entity({ slug: "openai", name: "OpenAI" });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps a successful result when the refresh itself fails", async () => {
    const env: EditorToolsEnvironment = {
      fetch: async () => ok({ slug: "openai" }),
      confirm: async () => true,
      refresh: () => {
        throw new Error("router gone");
      },
    };
    await expect(createEditorTools(env).admin_update_entity({ slug: "openai", name: "OpenAI" })).resolves.toEqual({ slug: "openai" });
  });
});

describe("editor tools: confirmation by the person", () => {
  /** Server that asks first and does the work once `confirmed` is true. */
  const needsConfirmation = (sent: Sent) =>
    sent.body.confirmed ? ok({ deletedSlug: "openai" }) : refused(409, "Permanently delete the entity “openai”?");

  it("shows the dialog with the server's question and what is affected, then confirms after approval", async () => {
    const { tools, sent, asked, refresh } = setup(needsConfirmation);
    await expect(tools.admin_delete_entity(deleteEntity)).resolves.toEqual({ deletedSlug: "openai" });

    expect(sent.map((entry) => entry.body.confirmed)).toEqual([false, true]);
    expect(sent[1].body.input).toEqual(sent[0].body.input);
    expect(asked).toEqual([
      {
        tool: "Delete newsroom entity",
        question: "Permanently delete the entity “openai”?",
        affected: ["slug: openai"],
        destructive: true,
      },
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("returns a declined error, changes nothing and does not refresh when the person declines", async () => {
    const { tools, sent, refresh } = setup(needsConfirmation, () => Promise.resolve(false));
    const result = await tools.admin_delete_entity(deleteEntity);
    expect(result).toEqual({ error: expect.stringMatching(/person declined.*Nothing was changed/) });
    expect(sent.map((entry) => entry.body.confirmed)).toEqual([false]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not call again when the call is cancelled while the dialog is open", async () => {
    const controller = new AbortController();
    const { tools, sent } = setup(needsConfirmation, async () => {
      controller.abort();
      return true;
    });
    await expect(tools.admin_delete_entity(deleteEntity, controller.signal)).resolves.toEqual({
      error: "admin_delete_entity was cancelled.",
    });
    expect(sent).toHaveLength(1);
  });

  it("maps a failure of the confirmed call like any other", async () => {
    const { tools } = setup((sent) => (sent.body.confirmed ? refused(403, "Needs newsroom.publish.") : refused(409, "Delete?")));
    await expect(tools.admin_delete_entity(deleteEntity)).resolves.toMatchObject({ error: expect.stringMatching(/may not use/) });
  });

  it("gives the agent no way to confirm: extra arguments are dropped and the first call is always unconfirmed", async () => {
    const { tools, sent } = setup(needsConfirmation, () => Promise.resolve(false));
    for (const bypass of [{ confirmed: true }, { confirm: true }, { confirm_action: true }, { _meta: { confirmed: true } }]) {
      await tools.admin_delete_entity({ ...deleteEntity, ...bypass });
    }
    for (const entry of sent) {
      expect(entry.body).toEqual({ input: { slug: "openai" }, confirmed: false });
    }
    expect(sent).toHaveLength(4);
  });

  it("holds for every confirming capability: the first request carries confirmed false and no flag in the input", async () => {
    const { tools, sent } = setup(() => refused(409, "Sure?"), () => Promise.resolve(false));
    const confirming = editorPageCapabilities.filter((capability) => capability.confirms);
    expect(confirming.map((capability) => capability.name)).toEqual(
      expect.arrayContaining(["admin_publish_article", "admin_unpublish_article", "admin_delete_article", "admin_delete_entity"]),
    );
    const id = "00000000-0000-4000-8000-000000000000";
    const attempts: Record<string, unknown> = {
      admin_publish_article: { id, locale: "en" },
      admin_unpublish_article: { id, locale: "en" },
      admin_delete_article: { id, locale: "en" },
      admin_delete_entity: deleteEntity,
    };
    for (const [name, input] of Object.entries(attempts)) {
      await tools[name]({ ...(input as object), confirmed: true, confirm: true });
    }
    expect(sent.map((entry) => entry.body.confirmed)).toEqual([false, false, false, false]);
    for (const entry of sent) expect(Object.keys(entry.body.input).filter((key) => /confirm/i.test(key))).toEqual([]);
  });

  it("handles two simultaneous confirming calls one at a time, each approved for its own action", async () => {
    const doc = new FakeDocument();
    const presenter = createConfirmPresenter(doc as unknown as Document, "en");
    const sent: Sent[] = [];
    const tools = createEditorTools({
      fetch: async (input, init) => {
        const entry = { url: String(input), body: JSON.parse(String(init?.body)), init: init! };
        sent.push(entry);
        const slug = (entry.body.input as { slug: string }).slug;
        return entry.body.confirmed ? ok({ deletedSlug: slug }) : refused(409, `Delete ${slug}?`);
      },
      confirm: presenter.confirm,
      refresh: vi.fn(),
    });
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const buttons = (label: string) => doc.modals[0].all().find((node) => node.tag === "button" && node.textContent === label)!;

    const a = tools.admin_delete_entity({ slug: "alpha" });
    const b = tools.admin_delete_entity({ slug: "beta" });
    await tick();
    expect(doc.dialogs()).toHaveLength(1);
    expect(doc.modals[0].text()).toContain("Delete alpha?");
    expect(sent.filter((entry) => entry.body.confirmed)).toHaveLength(0);

    buttons("Approve").click();
    await expect(a).resolves.toEqual({ deletedSlug: "alpha" });
    await tick();
    expect(doc.dialogs()).toHaveLength(1);
    expect(doc.modals[0].text()).toContain("Delete beta?");
    expect(sent.filter((entry) => entry.body.confirmed).map((entry) => entry.body.input)).toEqual([{ slug: "alpha" }]);

    buttons("Decline").click();
    await expect(b).resolves.toMatchObject({ error: expect.stringContaining("declined") });
    expect(sent.filter((entry) => entry.body.confirmed)).toHaveLength(1);
  });
});

describe("what the dialog says is affected", () => {
  it("lists scalars, short lists and batches without dumping content", () => {
    expect(
      describeAffected({
        id: "a1",
        locale: "en",
        skipped: undefined,
        items: [{ title: "One" }, { slug: "two" }, { id: "3" }, {}, "five", "six"],
        long: "x".repeat(300),
      }),
    ).toEqual([
      "id: a1",
      "locale: en",
      "items: 6 (One, two, 3, ..., five, ...)",
      `long: ${"x".repeat(117)}...`,
    ]);
  });
});

describe("the catalogue's schemas give the agent no way to confirm", () => {
  const properties = (schema: unknown, found: string[] = []): string[] => {
    if (Array.isArray(schema)) schema.forEach((entry) => properties(entry, found));
    else if (schema && typeof schema === "object") {
      for (const [key, value] of Object.entries(schema)) {
        if (key === "properties" && value && typeof value === "object") found.push(...Object.keys(value));
        properties(value, found);
      }
    }
    return found;
  };

  it("declares no property named confirm* anywhere, and closes no unknown key into the call", () => {
    for (const capability of editorPageCapabilities) {
      expect(properties(capability.inputSchema).filter((name) => /confirm|approve|consent/i.test(name)), capability.name).toEqual([]);
      expect(capability.inputSchema.additionalProperties, capability.name).not.toBe(true);
      expect(JSON.stringify(capability.inputSchema), capability.name).not.toMatch(/"additionalProperties":\s*\{/);
    }
  });

  it("matches the MCP endpoint: its confirm argument is added by the MCP adapter, not by the catalogue", () => {
    expect(editorPageCapabilities.filter((capability) => capability.confirms).length).toBeGreaterThan(8);
    for (const capability of editorPageCapabilities) {
      expect(Object.keys((capability.inputSchema.properties ?? {}) as object)).not.toContain("confirm");
    }
  });
});
