import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultMarkdownLabels } from "@/components/markdown/labels";
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

  describe("code highlighting", () => {
    it("highlights registered languages and their aliases on the server", () => {
      const html = renderToStaticMarkup(
        <MarkdownRenderer content={"```ts\nconst answer: number = 42; // done\n```\n\n```sh\necho \"hi\"\n```"} />,
      );

      expect(html).toContain('<code class="hljs language-ts">');
      expect(html).toContain('<span class="hljs-keyword">const</span>');
      expect(html).toContain('<span class="hljs-comment">// done</span>');
      expect(html).toContain('<span class="hljs-string">&quot;hi&quot;</span>');
    });

    it("leaves unknown languages and untagged fences plain", () => {
      const html = renderToStaticMarkup(
        <MarkdownRenderer content={"```cobol\nMOVE 1 TO X\n```\n\n```\nconst a = 1;\n```"} />,
      );

      expect(html).not.toContain("<span");
      expect(html).toContain("MOVE 1 TO X");
      expect(html).toContain("const a = 1;");
    });

    it("escapes code instead of interpreting it as HTML", () => {
      const html = renderToStaticMarkup(<MarkdownRenderer content={"```html\n<script>alert(1)</script>\n```"} />);

      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;");
    });
  });

  describe("callouts", () => {
    it("renders every GitHub alert kind as a labelled aside", () => {
      for (const [kind, label] of [["NOTE", "Note"], ["TIP", "Tip"], ["IMPORTANT", "Important"], ["WARNING", "Warning"], ["CAUTION", "Caution"]]) {
        const html = renderToStaticMarkup(<MarkdownRenderer content={`> [!${kind}]\n> Mind **this**.`} />);

        expect(html).toContain(`<aside class="markdown-callout markdown-callout--${kind.toLowerCase()}" role="note">`);
        expect(html).toContain(`<p class="markdown-callout__title">${label}</p>`);
        expect(html).toContain("<p>Mind <strong>this</strong>.</p>");
        expect(html).not.toContain("[!");
        expect(html).not.toContain("<blockquote");
      }
    });

    it("uses the labels of the article locale and accepts a lower-case marker", () => {
      const html = renderToStaticMarkup(
        <MarkdownRenderer
          content={"> [!warning]\n> Attenzione."}
          labels={{ ...defaultMarkdownLabels, callouts: { ...defaultMarkdownLabels.callouts, warning: "Avviso" } }}
        />,
      );

      expect(html).toContain('<p class="markdown-callout__title">Avviso</p>');
    });

    it("keeps the body paragraphs and an empty callout intact", () => {
      const body = renderToStaticMarkup(<MarkdownRenderer content={"> [!TIP]\n> One\n>\n> Two\n>\n> - item"} />);
      const empty = renderToStaticMarkup(<MarkdownRenderer content="> [!TIP]" />);

      expect(body).toContain("<p>One</p>");
      expect(body).toContain("<p>Two</p>");
      expect(body).toContain("<li>item</li>");
      expect(empty).toContain("markdown-callout--tip");
      expect(empty).not.toContain("[!TIP]");
    });

    it("leaves ordinary, nested and unknown quotes as blockquotes", () => {
      const html = renderToStaticMarkup(
        <MarkdownRenderer
          content={[
            "> Plain quote",
            "",
            "> > [!NOTE]",
            "> > nested",
            "",
            "> [!INFO]",
            "> unknown",
            "",
            "> [!NOTE] inline text",
            "",
            "- > [!NOTE]",
            "  > in a list",
          ].join("\n")}
        />,
      );

      expect(html).not.toContain("<aside");
      expect(html.match(/<blockquote>/g)?.length).toBeGreaterThanOrEqual(5);
      expect(html).toContain("[!INFO]");
    });
  });

  describe("embeds", () => {
    it("turns a lone YouTube URL into a facade without any third-party request", () => {
      for (const url of [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s",
        "https://youtu.be/dQw4w9WgXcQ?si=abc",
        "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        "<https://m.youtube.com/watch?v=dQw4w9WgXcQ>",
      ]) {
        const html = renderToStaticMarkup(<MarkdownRenderer content={`Before\n\n${url}\n\nAfter`} />);

        expect(html).toContain('class="markdown-embed markdown-embed--youtube"');
        expect(html).toContain("<button");
        expect(html).toContain("Load video");
        expect(html).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
        expect(html).toContain('rel="noopener noreferrer"');
        expect(html).not.toContain("<iframe");
        expect(html).not.toContain("youtube-nocookie");
        expect(html).not.toContain("ytimg");
      }
    });

    it("turns a lone X status URL into a facade linking to the post", () => {
      const html = renderToStaticMarkup(
        <MarkdownRenderer content="https://twitter.com/atlas_news/status/1790000000000000001" />,
      );

      expect(html).toContain('class="markdown-embed markdown-embed--x"');
      expect(html).toContain('href="https://x.com/atlas_news/status/1790000000000000001"');
      expect(html).toContain("@atlas_news");
      expect(html).toContain("Load post");
      expect(html).not.toContain("<iframe");
      expect(html).not.toContain("platform.twitter.com");
      expect(html).not.toContain("widgets.js");
    });

    it("uses the embed copy of the article locale", () => {
      const html = renderToStaticMarkup(
        <MarkdownRenderer
          content="https://youtu.be/dQw4w9WgXcQ"
          labels={{
            ...defaultMarkdownLabels,
            embeds: { ...defaultMarkdownLabels.embeds, youtube: { load: "Carica il video", open: "Guarda su YouTube", title: "Video" } },
          }}
        />,
      );

      expect(html).toContain("Carica il video");
      expect(html).toContain("Guarda su YouTube");
    });

    it("keeps everything that is not an exact, lone video or status URL as a link", () => {
      const cases = [
        "Watch https://youtu.be/dQw4w9WgXcQ now",
        "[A video](https://youtu.be/dQw4w9WgXcQ)",
        "- https://youtu.be/dQw4w9WgXcQ",
        "> https://youtu.be/dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQx",
        "https://youtu.be/dQw4w9WgXc",
        "https://youtu.be/dQw4w9WgXc!",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ%22onload",
        "https://www.youtube.com/watch?list=PL123",
        "https://www.youtube.com/playlist?list=PL123",
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
        "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
        "https://evil.example/https://youtu.be/dQw4w9WgXcQ",
        "https://user:pw@youtu.be/dQw4w9WgXcQ",
        "https://x.com/atlas/status/123abc",
        "https://x.com/atlas/status/",
        "https://x.com/atlas/likes",
        "https://x.com/waytoolongusername12345/status/123",
        "https://x.com.evil.example/atlas/status/123",
        "https://example.com/atlas/status/123",
        "ftp://youtu.be/dQw4w9WgXcQ",
      ];

      for (const content of cases) {
        const html = renderToStaticMarkup(<MarkdownRenderer content={content} />);

        expect(html, content).not.toContain("markdown-embed");
        expect(html, content).not.toContain("<iframe");
        expect(html, content).not.toContain("<button");
      }
      expect(renderToStaticMarkup(<MarkdownRenderer content="https://youtu.be/dQw4w9WgXcQx" />)).toContain("<a ");
    });

    it("never renders a frame from a forged embed element", () => {
      const html = renderToStaticMarkup(
        <MarkdownRenderer content={'<markdown-embed href="https://youtu.be/dQw4w9WgXcQ"></markdown-embed>'} />,
      );

      expect(html).not.toContain("markdown-embed");
      expect(html).not.toContain("youtube");
    });
  });

  it("keeps raw HTML skipped next to the new syntax", () => {
    const html = renderToStaticMarkup(
      <MarkdownRenderer
        content={'<iframe src="https://evil.example"></iframe>\n\n<aside class="markdown-callout">x</aside>\n\n> [!NOTE]\n> <img src=x onerror=alert(1)>'}
      />,
    );

    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("onerror");
    expect(html.match(/<aside/g)).toHaveLength(1);
  });
});
