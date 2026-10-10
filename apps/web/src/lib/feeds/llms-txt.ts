export interface LlmsLink {
  title: string;
  url: string;
  note?: string;
}

export interface LlmsSection {
  title: string;
  text?: string;
  links?: LlmsLink[];
}

/** One line of text for a Markdown list item or paragraph: no stored break can start a new block. */
function inline(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

function linkTitle(value: string) {
  return inline(value).replace(/[[\]\\]/gu, "\\$&");
}

/** The llms.txt convention (llmstxt.org): H1 name, blockquote summary, then H2 link sections. */
export function buildLlmsTxt(name: string, summary: string, sections: LlmsSection[]) {
  const blocks = [`# ${inline(name)}`, `> ${inline(summary)}`];
  for (const section of sections) {
    const lines = [`## ${inline(section.title)}`];
    if (section.text) lines.push("", inline(section.text));
    if (section.links?.length) {
      lines.push("", ...section.links.map((link) => {
        const note = link.note ? `: ${inline(link.note)}` : "";
        return `- [${linkTitle(link.title)}](${link.url})${note}`;
      }));
    }
    blocks.push(lines.join("\n"));
  }
  return `${blocks.join("\n\n")}\n`;
}
