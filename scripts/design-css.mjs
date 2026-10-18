#!/usr/bin/env node

// Keeps the stylesheets on the DESIGN.md scales: font sizes and spacing come from the tokens, media queries use
// the breakpoint scale, and the only px is a 1px hairline. Token definitions (custom properties) are where
// literals belong, so they are not checked; em and % stay allowed because they follow the element's own size.

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sources = join(root, "apps", "web", "src");
const tokensFile = join(sources, "app", "design.tokens.css");
const absolute = /(?<![\w.-])-?\d*\.?\d+(rem|px)\b/;
const spacing = /^(padding|margin|gap|row-gap|column-gap)(-[a-z-]+)?$/;

async function cssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.name.endsWith(".css") && path !== tokensFile ? [path] : [];
  }));
  return nested.flat();
}

const tokens = await readFile(tokensFile, "utf8");
const breakpoints = new Set([...tokens.matchAll(/--atlasnews-spacing-breakpoint-[\w-]+:\s*([\d.]+rem)/g)].map((match) => match[1]));
const problems = [];

for (const file of await cssFiles(sources)) {
  // Comments are blanked, not removed, so line numbers stay true.
  const css = (await readFile(file, "utf8")).replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const name = relative(root, file);
  css.split("\n").forEach((line, index) => {
    const at = `${name}:${index + 1}`;
    const media = line.match(/@media\b(.*)\{?/);
    if (media) {
      const values = [
        ...media[1].matchAll(/(?:width\s*[<>]=?\s*|-width:\s*)(-?[\d.]+[a-z]+)/g),
        ...media[1].matchAll(/(-?[\d.]+[a-z]+)\s*[<>]=?\s*width/g),
      ];
      for (const [, value] of values) {
        if (!breakpoints.has(value)) problems.push(`${at}: media query at ${value}; use a breakpoint from DESIGN.md (${[...breakpoints].join(", ")}).`);
      }
      return;
    }
    const declaration = line.match(/^\s*([a-z-]+)\s*:\s*(.+?);?\s*$/);
    if (!declaration) return;
    const [, property, value] = declaration;
    if (/(?<![\w.-])-?(?!1px)\d*\.?\d+px\b/.test(value)) problems.push(`${at}: ${property} uses px; only a 1px hairline is in px.`);
    if (property === "font-size" && absolute.test(value)) problems.push(`${at}: font-size ${value}; use a --text-* token.`);
    if (spacing.test(property) && /(?<![\w.-])-?\d*\.?\d+rem\b/.test(value)) problems.push(`${at}: ${property} ${value}; use --space-* tokens.`);
  });
}

if (problems.length) {
  process.stderr.write(`${problems.join("\n")}\n${problems.length} declarations are off the DESIGN.md scales.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Stylesheets use the DESIGN.md type, spacing and breakpoint scales (${breakpoints.size} breakpoints).\n`);
}
