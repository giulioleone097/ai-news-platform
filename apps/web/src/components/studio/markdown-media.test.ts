import { describe, expect, it } from "vitest";
import { maxMediaBytes } from "@atlasnews/core/editorial/domain/editorial-image";
import {
  altTextFromFileName,
  imageFileProblem,
  insertAtCursor,
  insertLine,
  markdownImage,
  removePlaceholder,
  replacePlaceholder,
  uniquePlaceholder,
} from "./markdown-media";

describe("Markdown image syntax", () => {
  it("writes the alt text and the URL the capability returned", () => {
    expect(markdownImage("Neural agents", "/media/atlas-hero.webp")).toBe(
      "![Neural agents](/media/atlas-hero.webp)",
    );
    expect(markdownImage("Chart", "/media-store/chart-2026.png")).toBe("![Chart](/media-store/chart-2026.png)");
    expect(markdownImage("Lab", "https://project.supabase.co/storage/v1/object/public/media/lab.jpg")).toBe(
      "![Lab](https://project.supabase.co/storage/v1/object/public/media/lab.jpg)",
    );
  });

  it("escapes brackets in the alt text and spaces or parentheses in the URL", () => {
    expect(markdownImage("Figure [1] and \\ two\n", "/media-store/a (1).png")).toBe(
      "![Figure \\[1\\] and \\\\ two](/media-store/a%20%281%29.png)",
    );
  });

  it("derives a proposed alt text from the file name", () => {
    expect(altTextFromFileName("atlas_news-hero.webp")).toBe("atlas news hero");
    expect(altTextFromFileName("photo.final.PNG")).toBe("photo.final");
    expect(altTextFromFileName(".png")).toBe("");
  });
});

describe("Image file limits", () => {
  it("accepts the Studio image types up to 8 MiB", () => {
    expect(imageFileProblem({ type: "image/webp", size: maxMediaBytes })).toBeNull();
    expect(imageFileProblem({ type: "image/avif", size: 1 })).toBeNull();
  });

  it("refuses other types and oversized or empty files", () => {
    expect(imageFileProblem({ type: "image/svg+xml", size: 100 })).toBe("type");
    expect(imageFileProblem({ type: "application/pdf", size: 100 })).toBe("type");
    expect(imageFileProblem({ type: "image/png", size: maxMediaBytes + 1 })).toBe("size");
    expect(imageFileProblem({ type: "image/png", size: 0 })).toBe("size");
  });
});

describe("Cursor insertion", () => {
  it("inserts at a collapsed cursor and leaves the caret after the text", () => {
    expect(insertAtCursor("Intro\nEnd", { start: 6, end: 6 }, "![a](b)")).toEqual({
      value: "Intro\n![a](b)End",
      selection: { start: 13, end: 13 },
    });
  });

  it("replaces the selected text", () => {
    expect(insertAtCursor("one two three", { start: 4, end: 7 }, "X")).toEqual({
      value: "one X three",
      selection: { start: 5, end: 5 },
    });
  });

  it("inserts at the start and at the end", () => {
    expect(insertAtCursor("body", { start: 0, end: 0 }, "A")).toEqual({
      value: "Abody",
      selection: { start: 1, end: 1 },
    });
    expect(insertAtCursor("body", { start: 4, end: 4 }, "Z")).toEqual({
      value: "bodyZ",
      selection: { start: 5, end: 5 },
    });
  });

  it("clamps a selection that points past the text", () => {
    expect(insertAtCursor("abc", { start: 10, end: 10 }, "!")).toEqual({
      value: "abc!",
      selection: { start: 4, end: 4 },
    });
  });
});

describe("Placeholder lines", () => {
  it("puts an upload placeholder on its own line, adding breaks only where needed", () => {
    expect(insertLine("Text", { start: 4, end: 4 }, "Uploading… a.png")).toEqual({
      value: "Text\nUploading… a.png",
      selection: { start: 21, end: 21 },
    });
    expect(insertLine("Text\n", { start: 5, end: 5 }, "Uploading… a.png")).toEqual({
      value: "Text\nUploading… a.png",
      selection: { start: 21, end: 21 },
    });
    expect(insertLine("Before\nAfter", { start: 6, end: 6 }, "P")).toEqual({
      value: "Before\nP\nAfter",
      selection: { start: 8, end: 8 },
    });
    expect(insertLine("", { start: 0, end: 0 }, "P")).toEqual({ value: "P", selection: { start: 1, end: 1 } });
  });

  it("replaces the placeholder with the image and moves the caret with the text", () => {
    const value = "Intro\nUploading… a.png\nOutro";
    const caretAfterOutro = value.length;
    const edit = replacePlaceholder(value, { start: caretAfterOutro, end: caretAfterOutro }, "Uploading… a.png", "![a](/media/a.png)");

    expect(edit.value).toBe("Intro\n![a](/media/a.png)\nOutro");
    expect(edit.selection).toEqual({ start: edit.value.length, end: edit.value.length });
  });

  it("keeps a caret before the placeholder where it was", () => {
    const value = "Intro\nUploading… a.png\nOutro";
    expect(replacePlaceholder(value, { start: 2, end: 2 }, "Uploading… a.png", "![a](/m/a.png)").selection).toEqual({
      start: 2,
      end: 2,
    });
  });

  it("appends the image when the author already removed the placeholder", () => {
    expect(replacePlaceholder("Text typed later", { start: 3, end: 3 }, "Uploading… a.png", "![a](/m/a.png)")).toEqual({
      value: "Text typed later\n![a](/m/a.png)",
      selection: { start: 3, end: 3 },
    });
  });

  it("removes a failed placeholder with its line break and keeps the rest", () => {
    const value = "Intro\nUploading… a.png\nOutro";
    const edit = removePlaceholder(value, { start: 26, end: 26 }, "Uploading… a.png");

    expect(edit.value).toBe("Intro\nOutro");
    expect(edit.selection).toEqual({ start: 9, end: 9 });
  });

  it("leaves the text alone when there is no placeholder to remove", () => {
    expect(removePlaceholder("Intro", { start: 2, end: 2 }, "Uploading… a.png")).toEqual({
      value: "Intro",
      selection: { start: 2, end: 2 },
    });
  });

  it("gives simultaneous uploads of the same name distinct placeholders", () => {
    const taken = new Set<string>(["Uploading… a.png"]);
    const first = uniquePlaceholder("Uploading… a.png", (candidate) => taken.has(candidate));
    taken.add(first);
    const second = uniquePlaceholder("Uploading… a.png", (candidate) => taken.has(candidate));

    expect(first).toBe("Uploading… a.png (2)");
    expect(second).toBe("Uploading… a.png (3)");
    expect(uniquePlaceholder("Uploading… b.png", () => false)).toBe("Uploading… b.png");
  });
});
