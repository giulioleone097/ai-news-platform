import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { extractMarkdownHeadings } from "@/lib/markdown";
import { applyMarkdownCommand } from "@/lib/markdown-editor";

describe("MarkdownRenderer", () => {
  it("renders GFM and heading ids that match the extracted outline", () => {
    const html = renderToStaticMarkup(
      <MarkdownRenderer content={`
## Agent safety
## Agent safety

- [x] Guard inputs
- [ ] Review outputs

| Layer | State |
| --- | --- |
| API | Ready |
`} />,
    );

    expect(html).toContain('<h2 id="section-agent-safety">Agent safety</h2>');
    expect(html).toContain('<h2 id="section-agent-safety-2">Agent safety</h2>');
    expect(html).toContain('class="contains-task-list"');
    expect(html).toContain('class="markdown-table-scroll"');
    expect(html).toContain("<table>");
  });

  it("uses one AST pipeline for autolinks, entities, raw tags and reserved ids", () => {
    const content = `
## Docs <https://example.com>
## Fish &copy;
## <span>Wrapped</span>
## toc title
`;
    const headings = extractMarkdownHeadings(content);
    const html = renderToStaticMarkup(<MarkdownRenderer content={content} />);

    expect(headings).toEqual([
      { depth: 2, id: "section-docs-https-example-com", text: "Docs https://example.com" },
      { depth: 2, id: "section-fish", text: "Fish ©" },
      { depth: 2, id: "section-wrapped", text: "Wrapped" },
      { depth: 2, id: "section-toc-title", text: "toc title" },
    ]);
    for (const heading of headings) expect(html).toContain(`id="${heading.id}"`);
    expect(html).not.toContain('id="toc-title"');
  });

  it("renders a backtick selected through the code toolbar as inline code", () => {
    const transformed = applyMarkdownCommand("code", { value: "`", start: 0, end: 1 });
    const html = renderToStaticMarkup(<MarkdownRenderer content={transformed.value} />);

    expect(transformed.value).toBe("`` ` ``");
    expect(html).toContain("<code>`</code>");
    expect(html).not.toContain("<pre>");
  });

  it("drops raw HTML and unsafe link destinations", () => {
    const html = renderToStaticMarkup(
      <MarkdownRenderer content={`
<script>alert("unsafe")</script>

[Unsafe](javascript:alert(document.cookie))
`} />,
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("document.cookie");
    expect(html).toContain(">Unsafe</a>");
  });

  it("opens external links without exposing the opener", () => {
    const html = renderToStaticMarkup(
      <MarkdownRenderer content="[Source](https://example.com/research) and [local](/en/about)." />,
    );

    expect(html).toContain('href="https://example.com/research" rel="noopener noreferrer" target="_blank"');
    expect(html).toContain('<a href="/en/about">local</a>');
  });

  it("renders only approved editorial images", () => {
    const html = renderToStaticMarkup(
      <MarkdownRenderer
        content={`
![Approved cover](/media/agent-office.webp)

![Remote cover](https://images.example.com/tracker.png)
`}
        imageUnavailableLabel="Image not available"
      />,
    );

    expect(html).toContain('alt="Approved cover"');
    expect(html).toContain('data-nimg="1"');
    expect(html).toContain('data-markdown-image-unavailable="true"');
    expect(html).toContain("Remote cover");
    expect(html).not.toContain("images.example.com");
  });

  it("uses the localized unavailable label when an invalid image has no alt text", () => {
    const html = renderToStaticMarkup(
      <MarkdownRenderer
        content="![](https://images.example.com/tracker.png)"
        imageUnavailableLabel="Immagine non disponibile"
      />,
    );

    expect(html).toContain("Immagine non disponibile");
    expect(html).not.toContain("images.example.com");
  });
});
