#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { lint } from "@google/design.md/linter";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = new URL("../DESIGN.md", import.meta.url);
const target = new URL("../apps/web/src/app/design.tokens.css", import.meta.url);
const write = process.argv.includes("--write");
const generated = spawnSync(
  "designmd",
  ["export", "DESIGN.md", "--format", "css-vars", "--prefix", "atlasnews"],
  { cwd: root, encoding: "utf8" },
);

// The css-vars export leaves the type scale out, so its sizes are written from the same parsed DESIGN.md.
// Weights, line heights and tracking are unitless or em, so the CSS sets them beside the size.
function typeScaleVars(markdown) {
  const lines = [...lint(markdown).designSystem.typography]
    .filter(([, level]) => level.fontSize)
    .map(([name, { fontSize }]) => `  --atlasnews-typography-${name}-font-size: ${fontSize.value}${fontSize.unit};`);
  return `:root {\n${lines.join("\n")}\n}\n`;
}

if (generated.status !== 0) {
  process.stderr.write(generated.stderr || "design.md token export failed.\n");
  process.exitCode = generated.status ?? 1;
} else {
  const expected =
    "/* Generated from DESIGN.md with @google/design.md 0.4.0. */\n" +
    `${generated.stdout.trimEnd()}\n` +
    typeScaleVars(await readFile(source, "utf8"));

  if (write) {
    await writeFile(target, expected);
    process.stdout.write("Updated apps/web/src/app/design.tokens.css from DESIGN.md.\n");
  } else {
    const current = await readFile(target, "utf8");

    if (current !== expected) {
      process.stderr.write(
        "Design tokens are stale. Run `pnpm design:tokens:write`.\n",
      );
      process.exitCode = 1;
    } else {
      process.stdout.write("Design tokens match DESIGN.md.\n");
    }
  }
}
