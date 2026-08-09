import type { Heading, PhrasingContent, Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified, type Plugin } from "unified";

export type MarkdownHeading = {
  depth: 2 | 3;
  id: string;
  text: string;
};

const headingNamespace = "section";
const outlineProcessor = unified().use(remarkParse).use(remarkGfm);

function phrasingText(node: PhrasingContent): string {
  if (node.type === "text" || node.type === "inlineCode") return node.value;
  if (node.type === "image" || node.type === "imageReference") return node.alt ?? "";
  if (node.type === "break") return " ";
  if ("children" in node) return node.children.map(phrasingText).join("");
  return "";
}

function headingText(node: Heading) {
  return node.children.map(phrasingText).join("").replace(/\s+/g, " ").trim();
}

export function slugifyMarkdownHeading(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "untitled";
}

function applyMarkdownHeadingIds(tree: Root) {
  const headings: MarkdownHeading[] = [];
  const seenIds = new Map<string, number>();

  function visit(nodes: RootContent[]) {
    for (const node of nodes) {
      if (node.type === "heading" && (node.depth === 2 || node.depth === 3)) {
        const text = headingText(node);
        if (!text) continue;

        const baseId = `${headingNamespace}-${slugifyMarkdownHeading(text)}`;
        const count = (seenIds.get(baseId) ?? 0) + 1;
        const id = count === 1 ? baseId : `${baseId}-${count}`;
        seenIds.set(baseId, count);
        node.data = {
          ...node.data,
          hProperties: {
            ...node.data?.hProperties,
            id,
          },
        };
        headings.push({ depth: node.depth, id, text });
        continue;
      }

      if ("children" in node) visit(node.children as RootContent[]);
    }
  }

  visit(tree.children);

  return headings;
}

export const markdownHeadingIdsPlugin: Plugin<[], Root> = () => (tree) => {
  applyMarkdownHeadingIds(tree);
};

export function extractMarkdownHeadings(content: string): MarkdownHeading[] {
  const tree = outlineProcessor.runSync(outlineProcessor.parse(content)) as Root;
  return applyMarkdownHeadingIds(tree);
}
