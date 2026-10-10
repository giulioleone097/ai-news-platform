import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { editorPageCapabilities, pageCapabilities } from "@atlasnews/contract/page";
import { findModelContext } from "@/components/site/site-tools/detect";
import { createFakeModelContext } from "@/components/site/site-tools/fake-model-context";
import { registerEditorTools } from "./register";
import type { EditorToolsEnvironment } from "./tools";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(here, path), "utf8");

const env: EditorToolsEnvironment = {
  fetch: () => Promise.reject(new Error("offline")),
  confirm: () => Promise.resolve(false),
  refresh: () => undefined,
};

afterEach(() => vi.restoreAllMocks());

describe("registerEditorTools", () => {
  it("registers each editor capability once, with the catalogue's own text, schema and hints", () => {
    const { context, tools, calls } = createFakeModelContext();
    registerEditorTools(context, env);

    expect(editorPageCapabilities.length).toBeGreaterThan(30);
    expect(calls).toEqual(editorPageCapabilities.map((capability) => capability.name));
    expect(new Set(calls).size).toBe(calls.length);
    for (const capability of editorPageCapabilities) {
      const tool = tools.get(capability.name)!;
      expect(tool.title).toBe(capability.title);
      expect(tool.description).toBe(capability.description);
      expect(tool.inputSchema).toEqual(capability.inputSchema);
      expect(tool.annotations).toEqual(capability.annotations);
    }
  });

  it("does not register twice when it is mounted again, and unregisters everything on cleanup", () => {
    const { context, tools, calls } = createFakeModelContext();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const first = registerEditorTools(context, env);
    expect(registerEditorTools(context, env)).toBe(first);
    expect(calls).toHaveLength(editorPageCapabilities.length);

    first();
    expect(tools.size).toBe(0);

    const again = registerEditorTools(context, env);
    expect(tools.size).toBe(editorPageCapabilities.length);
    expect(warn).not.toHaveBeenCalled();
    again();
  });

  it("lives beside the reader tools: no name is shared, so both can be registered in one page", () => {
    const { context, tools } = createFakeModelContext();
    const disposeEditor = registerEditorTools(context, env);
    const reader = new Set(pageCapabilities.map((capability) => capability.name));
    expect(editorPageCapabilities.some((capability) => reader.has(capability.name))).toBe(false);
    disposeEditor();
    expect(tools.size).toBe(0);
  });

  it("reports a refused registration instead of throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const stays = registerEditorTools({ registerTool: () => Promise.reject(new Error("blocked")) }, env);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warn).toHaveBeenCalledTimes(editorPageCapabilities.length);
    stays();
  });
});

describe("where the editor tools are mounted", () => {
  it("registers nothing when the browser has no WebMCP API", () => {
    expect(findModelContext({})).toBeNull();
    expect(findModelContext({ modelContext: {} })).toBeNull();
  });

  it("is mounted by the Studio layout and not by the reader layout", () => {
    expect(read("../../../app/[locale]/(studio)/studio/layout.tsx")).toContain("<StudioSiteTools locale={locale} />");
    expect(read("../../../app/[locale]/(site)/layout.tsx")).not.toMatch(/StudioSiteTools|studio\/site-tools/);
  });

  it("statically imports only what an editor without an agent already downloads", () => {
    const source = read("studio-site-tools.tsx");
    const staticImports = [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)].map((match) => match[1]);
    expect(staticImports.sort()).toEqual(["@/components/site/site-tools/detect", "next/navigation", "react"]);
    expect(source).toMatch(/import\("\.\/start"\)/);
    expect(source).toMatch(/dispose\?\.\(\)/);
  });
});
