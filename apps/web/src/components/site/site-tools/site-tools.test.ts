import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("the site tools loader", () => {
  it("statically imports only what a visitor without an agent already downloads", () => {
    const source = readFileSync(resolve(here, "site-tools.tsx"), "utf8");
    const staticImports = [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)].map((match) => match[1]);
    expect(staticImports.sort()).toEqual(["./detect", "next/navigation", "react"]);
    expect(source).toMatch(/import\("\.\/start"\)/);

    const detect = readFileSync(resolve(here, "detect.ts"), "utf8");
    expect(detect).not.toMatch(/^import\s+(?!type\b)/m);
  });
});
