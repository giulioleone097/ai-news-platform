import { afterEach, describe, expect, it, vi } from "vitest";
import { pageCapabilities } from "@atlasnews/contract/page";
import { findModelContext } from "./detect";
import { createFakeModelContext } from "./fake-model-context";
import { registerSiteTools } from "./register";
import type { SiteToolsEnvironment } from "./tools";

const env: SiteToolsEnvironment = {
  fetch: () => Promise.reject(new Error("offline")),
  navigate: () => Promise.resolve(true),
  openArticle: () => null,
  addBookmark: () => ({ added: true, count: 1 }),
};

afterEach(() => vi.restoreAllMocks());

describe("registerSiteTools", () => {
  it("registers each page capability once, with the catalogue's own text, schema and hints", () => {
    const { context, tools, calls } = createFakeModelContext();
    registerSiteTools(context, env);

    expect(calls).toEqual(pageCapabilities.map((capability) => capability.name));
    expect(calls).toHaveLength(5);
    for (const capability of pageCapabilities) {
      const tool = tools.get(capability.name)!;
      expect(tool.title).toBe(capability.title);
      expect(tool.description).toBe(capability.description);
      expect(tool.inputSchema).toEqual(capability.inputSchema);
      expect(tool.annotations).toEqual(capability.annotations);
    }
  });

  it("does not register twice when it is mounted again, and registers anew after cleanup", () => {
    const { context, tools, calls } = createFakeModelContext();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const first = registerSiteTools(context, env);
    const second = registerSiteTools(context, env);
    expect(second).toBe(first);
    expect(calls).toHaveLength(5);

    first();
    expect(tools.size).toBe(0);

    const third = registerSiteTools(context, env);
    expect(calls).toHaveLength(10);
    expect(tools.size).toBe(5);
    expect(warn).not.toHaveBeenCalled();
    third();
  });

  it("runs the handler with the tool's arguments and cancellation signal", async () => {
    const { context, tools } = createFakeModelContext();
    registerSiteTools(context, env);
    const controller = new AbortController();

    await expect(tools.get("open_article")!.execute({ slug: "Bad Slug" }, { signal: controller.signal })).resolves.toMatchObject({
      error: expect.stringContaining("open_article"),
    });
    await expect(tools.get("read_open_article")!.execute({})).resolves.toMatchObject({
      error: expect.stringContaining("No article is open"),
    });
  });

  it("reports a refused registration instead of throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const refusing = { registerTool: () => Promise.reject(new DOMException("no", "NotAllowedError")) };
    expect(() => registerSiteTools(refusing, env)()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warn).not.toHaveBeenCalled(); // disposed straight away: an abort is not a failure

    const stays = registerSiteTools({ registerTool: () => Promise.reject(new Error("blocked")) }, env);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warn).toHaveBeenCalledTimes(5);
    stays();
  });
});

describe("findModelContext", () => {
  it("finds document.modelContext and nothing else", () => {
    const { context } = createFakeModelContext();
    expect(findModelContext({ modelContext: context })).toBe(context);
    expect(findModelContext({})).toBeNull();
    expect(findModelContext({ modelContext: {} })).toBeNull();
    expect(findModelContext({ modelContext: { registerTool: "yes" } })).toBeNull();
  });
});
