#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = new URL("../src/app/design.tokens.css", import.meta.url);
const write = process.argv.includes("--write");
const generated = spawnSync(
  "designmd",
  ["export", "DESIGN.md", "--format", "css-vars", "--prefix", "neura"],
  { cwd: root, encoding: "utf8" },
);

if (generated.status !== 0) {
  process.stderr.write(generated.stderr || "design.md token export failed.\n");
  process.exitCode = generated.status ?? 1;
} else {
  const expected =
    "/* Generated from DESIGN.md with @google/design.md 0.4.0. */\n" +
    `${generated.stdout.trimEnd()}\n`;

  if (write) {
    await writeFile(target, expected);
    process.stdout.write("Updated src/app/design.tokens.css from DESIGN.md.\n");
  } else {
    const current = await readFile(target, "utf8");

    if (current !== expected) {
      process.stderr.write(
        "Design tokens are stale. Run `npm run design:tokens:write`.\n",
      );
      process.exitCode = 1;
    } else {
      process.stdout.write("Design tokens match DESIGN.md.\n");
    }
  }
}
