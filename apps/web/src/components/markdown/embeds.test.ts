import { describe, expect, it } from "vitest";
import { parseEmbedUrl } from "@/components/markdown/embeds";

describe("parseEmbedUrl", () => {
  it("builds the privacy-friendly YouTube frame and the canonical page from the id alone", () => {
    expect(parseEmbedUrl("https://youtu.be/dQw4w9WgXcQ?si=x&t=1")).toEqual({
      provider: "youtube",
      id: "dQw4w9WgXcQ",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      frame: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0",
    });
    expect(parseEmbedUrl("https://youtube.com/shorts/dQw4w9WgXcQ/")?.id).toBe("dQw4w9WgXcQ");
    expect(parseEmbedUrl("https://www.youtube.com/watch?v=abc_DEF-123&list=PL1")?.id).toBe("abc_DEF-123");
  });

  it("builds the X frame from the numeric status id", () => {
    expect(parseEmbedUrl("https://twitter.com/atlas_news/status/1790000000000000001")).toEqual({
      provider: "x",
      id: "1790000000000000001",
      user: "atlas_news",
      url: "https://x.com/atlas_news/status/1790000000000000001",
      frame: "https://platform.twitter.com/embed/Tweet.html?id=1790000000000000001&dnt=true",
    });
  });

  it("rejects ids with extra characters and look-alike hosts", () => {
    for (const value of [
      "https://youtu.be/dQw4w9WgXcQ&x=1",
      "https://youtu.be/dQw4w9WgXcQ/extra",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ'onload=1",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ/../x",
      "https://x.com/atlas/status/12345678901234567890123",
      "https://x.com/atlas/status/12/photo/1",
      "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
      "javascript:alert(1)",
      "not a url",
    ]) {
      expect(parseEmbedUrl(value), value).toBeNull();
    }
  });
});
