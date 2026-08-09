import { describe, expect, it } from "vitest";
import { extractMarkdownHeadings, slugifyMarkdownHeading } from "@/lib/markdown";

describe("Markdown headings", () => {
  it("creates stable, readable slugs", () => {
    expect(slugifyMarkdownHeading("L’AI è già qui: cosa cambia? ")).toBe("lai-e-gia-qui-cosa-cambia");
    expect(slugifyMarkdownHeading("***")).toBe("untitled");
  });

  it("extracts H2 and H3 headings with unique ids", () => {
    const headings = extractMarkdownHeadings(`
## **Agent** workflows
### [Safety first](https://example.com)
## Agent workflows
## C#
Setext heading
---
`);

    expect(headings).toEqual([
      { depth: 2, id: "section-agent-workflows", text: "Agent workflows" },
      { depth: 3, id: "section-safety-first", text: "Safety first" },
      { depth: 2, id: "section-agent-workflows-2", text: "Agent workflows" },
      { depth: 2, id: "section-c", text: "C#" },
      { depth: 2, id: "section-setext-heading", text: "Setext heading" },
    ]);
  });

  it("ignores heading syntax inside fenced code", () => {
    expect(extractMarkdownHeadings(`
~~~md
## Not a heading
~~~still code
### Still not a heading
~~~
## A real heading

\`\`\`
### Also not a heading
\`\`\`
`)).toEqual([
      { depth: 2, id: "section-a-real-heading", text: "A real heading" },
    ]);
  });
});
