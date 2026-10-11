import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultMarkdownLabels } from "@/components/markdown/labels";

// Server rendering never clicks: pin the "loaded" state to inspect the frame a click produces.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: () => [true, () => undefined],
}));

const { EmbedFrame } = await import("@/components/markdown/embed-frame");

describe("EmbedFrame after a click", () => {
  it("loads the YouTube no-cookie player in a sandboxed lazy frame", () => {
    const html = renderToStaticMarkup(
      <EmbedFrame href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" labels={defaultMarkdownLabels.embeds} />,
    );

    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&amp;rel=0"');
    expect(html).toContain('title="YouTube video"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"');
    expect(html).toContain('referrerPolicy="strict-origin-when-cross-origin"');
    expect(html).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
    expect(html).not.toContain("<button");
  });

  it("loads the X tweet frame only, without widgets.js", () => {
    const html = renderToStaticMarkup(
      <EmbedFrame href="https://x.com/atlas/status/1790000000000000001" labels={defaultMarkdownLabels.embeds} />,
    );

    expect(html).toContain('src="https://platform.twitter.com/embed/Tweet.html?id=1790000000000000001&amp;dnt=true"');
    expect(html).toContain('title="Post on X"');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"');
    expect(html).not.toContain("widgets.js");
  });

  it("renders nothing for an href that is not a valid canonical embed", () => {
    for (const href of ["https://evil.example/embed", "https://youtu.be/short", "javascript:alert(1)"]) {
      expect(renderToStaticMarkup(<EmbedFrame href={href} labels={defaultMarkdownLabels.embeds} />)).toBe("");
    }
  });
});
