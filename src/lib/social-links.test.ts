import { describe, expect, it } from "vitest";
import { buildSocialLinks } from "./social-links";

describe("buildSocialLinks", () => {
  it("encodes titles and URLs without leaking raw query separators", () => {
    const links = buildSocialLinks({
      title: "AI & lavoro",
      url: "https://example.com/a?x=1&y=2",
    });

    expect(links.linkedin).toContain("https%3A%2F%2Fexample.com%2Fa%3Fx%3D1%26y%3D2");
    expect(links.x).toContain("AI%20%26%20lavoro");
  });
});
