import { describe, expect, it } from "vitest";
import {
  applyMarkdownCommand,
  getMarkdownStats,
  markdownCommands,
  type MarkdownCommand,
} from "./markdown-editor";

function apply(command: MarkdownCommand, value: string, start: number, end = start) {
  return applyMarkdownCommand(command, { value, start, end });
}

describe("Markdown editor commands", () => {
  it("exposes the complete toolbar command contract", () => {
    expect(markdownCommands).toEqual([
      "heading",
      "bold",
      "italic",
      "strike",
      "link",
      "quote",
      "bullets",
      "numbered",
      "checklist",
      "code",
      "image",
    ]);
  });

  it.each([
    ["bold", "**", "bold text"],
    ["italic", "_", "italic text"],
    ["strike", "~~", "strikethrough"],
  ] as const)("wraps and toggles %s formatting", (command, marker, placeholder) => {
    expect(apply(command, "Hello", 0, 5)).toEqual({
      value: `${marker}Hello${marker}`,
      selectionStart: marker.length,
      selectionEnd: marker.length + 5,
    });

    expect(apply(command, `${marker}Hello${marker}`, 0, 5 + marker.length * 2)).toEqual({
      value: "Hello",
      selectionStart: 0,
      selectionEnd: 5,
    });

    expect(apply(command, "", 0)).toEqual({
      value: `${marker}${placeholder}${marker}`,
      selectionStart: marker.length,
      selectionEnd: marker.length + placeholder.length,
    });
  });

  it("removes surrounding inline markers while the content is selected", () => {
    expect(apply("bold", "Say **hello** now", 6, 11)).toEqual({
      value: "Say hello now",
      selectionStart: 4,
      selectionEnd: 9,
    });
  });

  it("normalizes and toggles headings without touching adjacent lines", () => {
    const normalized = apply("heading", "Intro\n# First\nOutro", 8, 13);

    expect(normalized).toEqual({
      value: "Intro\n## First\nOutro",
      selectionStart: 9,
      selectionEnd: 14,
    });
    expect(apply("heading", normalized.value, 6, 14).value).toBe("Intro\nFirst\nOutro");
  });

  it("adds quotes to selected lines, preserves blank separators, and toggles them off", () => {
    const quoted = apply("quote", "Alpha\n\nBeta", 0, 11);

    expect(quoted.value).toBe("> Alpha\n\n> Beta");
    expect(apply("quote", quoted.value, 0, quoted.value.length).value).toBe("Alpha\n\nBeta");
  });

  it("switches list kinds predictably and keeps checklist state", () => {
    expect(apply("bullets", "1. Alpha\n2. Beta", 0, 16).value).toBe("- Alpha\n- Beta");
    expect(apply("numbered", "- Alpha\n- Beta", 0, 14).value).toBe("1. Alpha\n2. Beta");
    expect(apply("checklist", "- [x] Done\nNext", 0, 15).value).toBe(
      "- [x] Done\n- [ ] Next",
    );
    expect(apply("checklist", "- [x] Done\n- [ ] Next", 0, 21).value).toBe("Done\nNext");
  });

  it("starts a line command at the cursor on an empty line", () => {
    expect(apply("checklist", "", 0)).toEqual({
      value: "- [ ] ",
      selectionStart: 6,
      selectionEnd: 6,
    });

    expect(apply("heading", "\nLater", 0)).toEqual({
      value: "## \nLater",
      selectionStart: 3,
      selectionEnd: 3,
    });
  });

  it("uses inline code for one line and a safe fence for multiple lines", () => {
    expect(apply("code", "const answer = 42", 0, 17)).toEqual({
      value: "`const answer = 42`",
      selectionStart: 1,
      selectionEnd: 18,
    });

    const fenced = apply("code", "one\n```\ntwo", 0, 11);
    expect(fenced.value).toBe("````\none\n```\ntwo\n````");
    expect(fenced.selectionStart).toBe(5);
    expect(fenced.selectionEnd).toBe(16);
    expect(apply("code", fenced.value, 0, fenced.value.length).value).toBe("one\n```\ntwo");
  });

  it("pads inline code delimiters when the selection contains backticks", () => {
    const result = apply("code", "`", 0, 1);

    expect(result).toEqual({
      value: "`` ` ``",
      selectionStart: 3,
      selectionEnd: 4,
    });
    expect(apply("code", result.value, 0, result.value.length).value).toBe("`");
  });

  it.each([
    ["link", "Read more", "[Read more](https://)", 12],
    ["image", "Diagram", "![Diagram](https://)", 11],
  ] as const)("inserts a %s and selects only its URL placeholder", (command, label, value, urlStart) => {
    expect(apply(command, label, 0, label.length)).toEqual({
      value,
      selectionStart: urlStart,
      selectionEnd: urlStart + 8,
    });
  });

  it("clamps and orders invalid selection boundaries", () => {
    expect(apply("bold", "Hello", 99, -2)).toEqual({
      value: "**Hello**",
      selectionStart: 2,
      selectionEnd: 7,
    });
  });
});

describe("Markdown editor statistics", () => {
  it("counts Unicode words and source characters without counting Markdown punctuation", () => {
    const value = "**Ciao** mondo, AI-first — أهلاً 2026";

    expect(getMarkdownStats(value)).toEqual({
      words: 5,
      characters: value.length,
    });
  });

  it("returns zero words for empty or punctuation-only content", () => {
    expect(getMarkdownStats("  ---  ")).toEqual({ words: 0, characters: 7 });
  });
});
