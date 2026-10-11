import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";

/**
 * Only these grammars are bundled (about 75 KB minified with lowlight; rehype-highlight would also pull in
 * lowlight's whole `common` set, 180 KB). Each grammar carries its aliases (ts, js, sh, py, yml, html,
 * golang, ...). Any other fence stays plain text.
 * ceiling: add a language here only when editors need it; the trigger is the Worker size budget.
 */
const lowlight = createLowlight({ bash, css, diff, go, javascript, json, python, rust, sql, typescript, xml, yaml });

type HastNode = {
  type: string;
  tagName?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
  value?: string;
};

function fenceLanguage(code: HastNode) {
  const classes = Array.isArray(code.properties?.className) ? code.properties.className : [];
  const name = classes.find((value): value is string => typeof value === "string" && value.startsWith("language-"));
  return name?.slice("language-".length);
}

function highlightFences(node: HastNode) {
  for (const child of node.children ?? []) {
    const code = child.tagName === "pre" ? child.children?.[0] : undefined;
    const language = code?.tagName === "code" ? fenceLanguage(code) : undefined;
    const source = code?.children?.length === 1 ? code.children[0] : undefined;

    if (code && language && source?.type === "text" && lowlight.registered(language)) {
      code.properties = { className: ["hljs", `language-${language}`] };
      code.children = lowlight.highlight(language, source.value ?? "").children as HastNode[];
    } else if (!code) {
      highlightFences(child);
    }
  }
}

/** rehype plugin: syntax-highlights fenced code of the registered languages at render time, adding no client code. */
export function rehypeHighlightFences() {
  return (tree: HastNode) => highlightFences(tree);
}
