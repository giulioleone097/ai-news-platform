import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { capabilities, mcpCapabilities } from "@atlasnews/contract";
import { pageCapabilities, studioPageCapabilities } from "@atlasnews/contract/page";
import { findModelContext } from "@/components/site/site-tools/detect";
import { createFakeModelContext } from "@/components/site/site-tools/fake-model-context";
import { registerStudioTools } from "./register";
import type { StudioToolsEnvironment } from "./tools";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(here, path), "utf8");

const env: StudioToolsEnvironment = {
  navigate: () => Promise.resolve(true),
  articleForm: () => null,
  path: () => "/en/studio",
  wait: () => Promise.resolve(),
};

afterEach(() => vi.restoreAllMocks());

describe("registerStudioTools", () => {
  it("registers each Studio page tool once, with the catalogue's own text, schema and hints", () => {
    const { context, tools, calls } = createFakeModelContext();
    registerStudioTools(context, env);

    expect(calls).toEqual(["open_article_editor", "read_article_form", "fill_article_form"]);
    expect(calls).toEqual(studioPageCapabilities.map((capability) => capability.name));
    for (const capability of studioPageCapabilities) {
      const tool = tools.get(capability.name)!;
      expect(tool.title).toBe(capability.title);
      expect(tool.description).toBe(capability.description);
      expect(tool.inputSchema).toEqual(capability.inputSchema);
      expect(tool.annotations).toEqual(capability.annotations);
    }
  });

  it("offers no data or operation tool: no name is an MCP tool's, so an agent on MCP sees nothing twice", () => {
    const { context, calls } = createFakeModelContext();
    registerStudioTools(context, env);
    const mcp = new Set([...mcpCapabilities, ...capabilities].map((capability) => capability.name));
    expect(calls.filter((name) => mcp.has(name))).toEqual([]);
  });

  it("does not register twice when it is mounted again, and unregisters everything on cleanup", () => {
    const { context, tools, calls } = createFakeModelContext();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const first = registerStudioTools(context, env);
    expect(registerStudioTools(context, env)).toBe(first);
    expect(calls).toHaveLength(3);

    first();
    expect(tools.size).toBe(0);

    const again = registerStudioTools(context, env);
    expect(tools.size).toBe(3);
    expect(warn).not.toHaveBeenCalled();
    again();
  });

  it("lives beside the reader tools: no name is shared, so both can be registered in one page", () => {
    const { context, tools } = createFakeModelContext();
    const disposeStudio = registerStudioTools(context, env);
    const reader = new Set(pageCapabilities.map((capability) => capability.name));
    expect(studioPageCapabilities.some((capability) => reader.has(capability.name))).toBe(false);
    disposeStudio();
    expect(tools.size).toBe(0);
  });

  it("runs a tool with the arguments and the cancellation signal the host gives", async () => {
    const { context, tools } = createFakeModelContext();
    registerStudioTools(context, env);
    const controller = new AbortController();
    await expect(tools.get("read_article_form")!.execute({}, { signal: controller.signal })).resolves.toEqual({
      error: "No article form is open. Open one with open_article_editor first.",
    });
    await expect(tools.get("open_article_editor")!.execute({ slug: "Bad Slug" })).resolves.toMatchObject({
      error: expect.stringContaining("open_article_editor"),
    });
  });

  it("reports a refused registration instead of throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const stays = registerStudioTools({ registerTool: () => Promise.reject(new Error("blocked")) }, env);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warn).toHaveBeenCalledTimes(3);
    stays();
  });
});

describe("where the Studio tools are mounted", () => {
  it("registers nothing when the browser has no WebMCP API", () => {
    expect(findModelContext({})).toBeNull();
    expect(findModelContext({ modelContext: {} })).toBeNull();
  });

  it("is mounted by the Studio layout and not by the reader layout", () => {
    expect(read("../../../app/[locale]/(studio)/studio/layout.tsx")).toContain("<StudioSiteTools />");
    expect(read("../../../app/[locale]/(site)/layout.tsx")).not.toMatch(/StudioSiteTools|studio\/site-tools/);
  });

  it("statically imports only what an editor without an agent already downloads", () => {
    const source = read("studio-site-tools.tsx");
    const staticImports = [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)].map((match) => match[1]);
    expect(staticImports.sort()).toEqual(["@/components/site/site-tools/detect", "next/navigation", "react"]);
    expect(source).toMatch(/import\("\.\/start"\)/);
    expect(source).toMatch(/dispose\?\.\(\)/);
  });

  it("leaves the server alone: the tools call no route and run no capability", () => {
    for (const file of ["tools.ts", "register.ts", "start.ts", "article-form-bridge.ts", "studio-site-tools.tsx"]) {
      expect(read(file), file).not.toMatch(/fetch\(|\/api\/|runEditorCapability|runStudioCapability|@\/server\//);
    }
  });
});
