import { describe, expect, it } from "vitest";
import {
  renderConfirmationEmailDocument,
  renderNewsletterEmailDocument,
  renderSafeNewsletterMarkdown,
} from "./markdown";

describe("safe newsletter rendering", () => {
  it("renders GFM while dropping raw HTML and unsafe URLs", () => {
    const html = renderSafeNewsletterMarkdown(`## Update

<script>alert(1)</script>

**Safe** [bad](javascript:alert(1))

| A | B |
| - | - |
| 1 | 2 |`);
    expect(html).toContain("<h2");
    expect(html).toContain("<strong>Safe</strong>");
    expect(html).toContain("<table");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
  });

  it("produces complete responsive documents with escaped metadata", () => {
    const html = renderNewsletterEmailDocument({
      locale: "en",
      markdown: "Hello **world**",
      preheader: '<img src=x onerror="alert(1)">',
      subject: "AI <weekly>",
      unsubscribeUrl: "https://example.com/unsubscribe?t=1&v=2",
      unsubscribeLabel: "Unsubscribe",
    });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("AI &lt;weekly&gt;");
    expect(html).toContain("t=1&amp;v=2");
    expect(html).not.toContain("onerror=");

    const confirmation = renderConfirmationEmailDocument({
      confirmationUrl: "https://example.com/confirm?a=1&b=2",
      locale: "it",
    });
    expect(confirmation).toContain("Conferma iscrizione");
    expect(confirmation).toContain("a=1&amp;b=2");
  });
});
