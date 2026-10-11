import type { Blockquote, Paragraph, Root } from "mdast";
import type { Plugin } from "unified";
import { calloutKinds, type CalloutKind, type MarkdownLabels } from "./labels";

const markerPattern = new RegExp(`^\\[!(${calloutKinds.join("|")})\\][ \\t]*(?:\\r?\\n|$)`, "i");

function calloutKind(quote: Blockquote): { kind: CalloutKind; rest: string } | null {
  const first = quote.children[0];
  const text = first?.type === "paragraph" ? first.children[0] : undefined;
  if (text?.type !== "text") return null;

  const match = markerPattern.exec(text.value);
  if (!match) return null;
  return { kind: match[1]!.toLowerCase() as CalloutKind, rest: text.value.slice(match[0].length) };
}

/**
 * GitHub alert syntax (`> [!NOTE]`, TIP, IMPORTANT, WARNING, CAUTION) on a top-level blockquote becomes an
 * `<aside role="note">` with a localized title. Nested quotes and unknown markers stay plain blockquotes.
 */
export const markdownCalloutsPlugin: Plugin<[Pick<MarkdownLabels, "callouts">], Root> =
  ({ callouts }) =>
  (tree) => {
    for (const node of tree.children) {
      if (node.type !== "blockquote") continue;
      const found = calloutKind(node);
      if (!found) continue;

      const first = node.children[0] as Paragraph;
      if (found.rest) (first.children[0] as { value: string }).value = found.rest;
      else first.children.shift();
      if (!first.children.length) node.children.shift();

      const title: Paragraph = {
        type: "paragraph",
        children: [{ type: "text", value: callouts[found.kind] }],
        data: { hName: "p", hProperties: { className: ["markdown-callout__title"] } },
      };
      node.children.unshift(title);
      node.data = {
        hName: "aside",
        hProperties: { className: ["markdown-callout", `markdown-callout--${found.kind}`], role: "note" },
      };
    }
  };
