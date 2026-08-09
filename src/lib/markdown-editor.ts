export const markdownCommands = [
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
] as const;

export type MarkdownCommand = (typeof markdownCommands)[number];

export type MarkdownSelection = {
  value: string;
  start: number;
  end: number;
};

export type MarkdownTransform = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

export type MarkdownStats = {
  words: number;
  characters: number;
};

type NormalizedSelection = {
  value: string;
  start: number;
  end: number;
};

type ParsedPrefix = {
  indentation: string;
  marker: string;
  content: string;
};

type LineEdit = {
  before: string;
  after: string;
  oldPrefixLength: number;
  newPrefixLength: number;
};

const INLINE_COMMANDS = {
  bold: { marker: "**", placeholder: "bold text" },
  italic: { marker: "_", placeholder: "italic text" },
  strike: { marker: "~~", placeholder: "strikethrough" },
} as const;

const URL_PLACEHOLDER = "https://";

function clampIndex(index: number, length: number) {
  if (!Number.isFinite(index)) {
    return 0;
  }

  return Math.min(length, Math.max(0, Math.trunc(index)));
}

function normalizeSelection(input: MarkdownSelection): NormalizedSelection {
  const first = clampIndex(input.start, input.value.length);
  const second = clampIndex(input.end, input.value.length);

  return {
    value: input.value,
    start: Math.min(first, second),
    end: Math.max(first, second),
  };
}

function replaceRange(
  selection: NormalizedSelection,
  replacement: string,
  selectionStart: number,
  selectionEnd: number,
): MarkdownTransform {
  return {
    value:
      selection.value.slice(0, selection.start) +
      replacement +
      selection.value.slice(selection.end),
    selectionStart,
    selectionEnd,
  };
}

function wrapSelection(
  selection: NormalizedSelection,
  marker: string,
  placeholder: string,
): MarkdownTransform {
  const selected = selection.value.slice(selection.start, selection.end);

  if (
    selected.length >= marker.length * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const content = selected.slice(marker.length, -marker.length);

    return replaceRange(
      selection,
      content,
      selection.start,
      selection.start + content.length,
    );
  }

  const openingStart = selection.start - marker.length;
  const hasSurroundingMarkers =
    openingStart >= 0 &&
    selection.value.slice(openingStart, selection.start) === marker &&
    selection.value.slice(selection.end, selection.end + marker.length) === marker;

  if (hasSurroundingMarkers) {
    const value =
      selection.value.slice(0, openingStart) +
      selected +
      selection.value.slice(selection.end + marker.length);

    return {
      value,
      selectionStart: openingStart,
      selectionEnd: openingStart + selected.length,
    };
  }

  const content = selected || placeholder;
  const replacement = `${marker}${content}${marker}`;

  return replaceRange(
    selection,
    replacement,
    selection.start + marker.length,
    selection.start + marker.length + content.length,
  );
}

function insertLink(selection: NormalizedSelection, image: boolean): MarkdownTransform {
  const selected = selection.value.slice(selection.start, selection.end);
  const label = selected || (image ? "image description" : "link text");
  const opening = image ? "![" : "[";
  const replacement = `${opening}${label}](${URL_PLACEHOLDER})`;
  const urlStart = selection.start + opening.length + label.length + 2;

  return replaceRange(
    selection,
    replacement,
    urlStart,
    urlStart + URL_PLACEHOLDER.length,
  );
}

function parsePrefix(line: string, pattern: RegExp): ParsedPrefix | null {
  const match = pattern.exec(line);

  if (!match) {
    return null;
  }

  return {
    indentation: match[1] ?? "",
    marker: match[2] ?? "",
    content: match[3] ?? "",
  };
}

function parseIndentation(line: string): ParsedPrefix {
  const indentation = /^\s*/u.exec(line)?.[0] ?? "";

  return {
    indentation,
    marker: "",
    content: line.slice(indentation.length),
  };
}

const headingPattern = /^(\s{0,3})(#{1,6}\s+)(.*)$/u;
const quotePattern = /^(\s{0,3})(>\s?)(.*)$/u;
const bulletPattern = /^(\s*)([-+*]\s+)(?!\[[ xX]\]\s)(.*)$/u;
const numberedPattern = /^(\s*)(\d+[.)]\s+)(.*)$/u;
const checklistPattern = /^(\s*)([-+*]\s+\[[ xX]\]\s+)(.*)$/u;
const listPattern = /^(\s*)((?:[-+*]\s+\[[ xX]\]\s+)|(?:[-+*]\s+)|(?:\d+[.)]\s+))(.*)$/u;

function editPrefix(line: string, parsed: ParsedPrefix, marker: string): LineEdit {
  return {
    before: line,
    after: `${parsed.indentation}${marker}${parsed.content}`,
    oldPrefixLength: parsed.indentation.length + parsed.marker.length,
    newPrefixLength: parsed.indentation.length + marker.length,
  };
}

function identityLineEdit(line: string): LineEdit {
  return {
    before: line,
    after: line,
    oldPrefixLength: 0,
    newPrefixLength: 0,
  };
}

function transformLinePrefixes(command: MarkdownCommand, lines: string[]): LineEdit[] {
  const nonBlankLines = lines.filter((line) => line.trim().length > 0);
  const singleEmptyLine = lines.length === 1 && nonBlankLines.length === 0;

  if (command === "heading") {
    const remove =
      nonBlankLines.length > 0 &&
      nonBlankLines.every((line) => /^\s{0,3}##\s+/u.test(line));

    return lines.map((line) => {
      if (line.trim().length === 0 && !singleEmptyLine) {
        return identityLineEdit(line);
      }

      const parsed = parsePrefix(line, headingPattern) ?? parseIndentation(line);
      return editPrefix(line, parsed, remove ? "" : "## ");
    });
  }

  if (command === "quote") {
    const remove =
      nonBlankLines.length > 0 &&
      nonBlankLines.every((line) => quotePattern.test(line));

    return lines.map((line) => {
      if (line.trim().length === 0 && !singleEmptyLine) {
        return identityLineEdit(line);
      }

      const parsed = parsePrefix(line, quotePattern) ?? parseIndentation(line);
      return editPrefix(line, parsed, remove ? "" : "> ");
    });
  }

  const targetPattern =
    command === "bullets"
      ? bulletPattern
      : command === "numbered"
        ? numberedPattern
        : checklistPattern;
  const remove =
    nonBlankLines.length > 0 && nonBlankLines.every((line) => targetPattern.test(line));
  let itemNumber = 1;

  return lines.map((line) => {
    if (line.trim().length === 0 && !singleEmptyLine) {
      itemNumber = 1;
      return identityLineEdit(line);
    }

    const parsed = parsePrefix(line, listPattern) ?? parseIndentation(line);
    let marker = "";

    if (!remove) {
      if (command === "bullets") {
        marker = "- ";
      } else if (command === "numbered") {
        marker = `${itemNumber}. `;
        itemNumber += 1;
      } else {
        const existingChecklist = parsePrefix(line, checklistPattern);
        marker = existingChecklist?.marker.replace(/^[-+*]/u, "-") ?? "- [ ] ";
      }
    }

    return editPrefix(line, parsed, marker);
  });
}

function mapLineOffset(edits: LineEdit[], offset: number) {
  let oldLineStart = 0;
  let newLineStart = 0;

  for (const edit of edits) {
    const oldLineEnd = oldLineStart + edit.before.length;

    if (offset <= oldLineEnd) {
      const localOffset = offset - oldLineStart;
      const mappedLocalOffset =
        localOffset <= edit.oldPrefixLength
          ? edit.newPrefixLength
          : edit.newPrefixLength + localOffset - edit.oldPrefixLength;

      return newLineStart + Math.min(edit.after.length, mappedLocalOffset);
    }

    oldLineStart = oldLineEnd + 1;
    newLineStart += edit.after.length + 1;
  }

  return Math.max(0, newLineStart - 1);
}

function transformSelectedLines(
  command: MarkdownCommand,
  selection: NormalizedSelection,
): MarkdownTransform {
  const effectiveEnd =
    selection.end > selection.start && selection.value[selection.end - 1] === "\n"
      ? selection.end - 1
      : selection.end;
  const previousLineBreak =
    selection.start === 0 ? -1 : selection.value.lastIndexOf("\n", selection.start - 1);
  const lineStart = previousLineBreak + 1;
  const nextLineBreak = selection.value.indexOf("\n", effectiveEnd);
  const lineEnd = nextLineBreak === -1 ? selection.value.length : nextLineBreak;
  const block = selection.value.slice(lineStart, lineEnd);
  const edits = transformLinePrefixes(command, block.split("\n"));
  const replacement = edits.map((edit) => edit.after).join("\n");
  const value =
    selection.value.slice(0, lineStart) + replacement + selection.value.slice(lineEnd);
  const relativeStart = selection.start - lineStart;
  const relativeEnd = Math.min(selection.end, lineEnd) - lineStart;
  const trailingSelection = Math.max(0, selection.end - lineEnd);

  return {
    value,
    selectionStart: lineStart + mapLineOffset(edits, relativeStart),
    selectionEnd:
      lineStart +
      mapLineOffset(edits, relativeEnd) +
      Math.min(trailingSelection, value.length - (lineStart + replacement.length)),
  };
}

function longestBacktickRun(value: string) {
  return Math.max(0, ...Array.from(value.matchAll(/`+/gu), (match) => match[0].length));
}

function decodeCodeSpanContent(value: string) {
  return value.startsWith(" ") && value.endsWith(" ") && /\S/u.test(value)
    ? value.slice(1, -1)
    : value;
}

function insertCode(selection: NormalizedSelection): MarkdownTransform {
  const selected = selection.value.slice(selection.start, selection.end);

  if (selected.includes("\n")) {
    const fencedMatch = /^(`{3,})[^\n]*\n([\s\S]*?)\n\1$/u.exec(selected);

    if (fencedMatch) {
      const content = fencedMatch[2];
      return replaceRange(
        selection,
        content,
        selection.start,
        selection.start + content.length,
      );
    }

    const content = selected || "code";
    const fence = "`".repeat(Math.max(3, longestBacktickRun(content) + 1));
    const replacement = `${fence}\n${content}\n${fence}`;

    return replaceRange(
      selection,
      replacement,
      selection.start + fence.length + 1,
      selection.start + fence.length + 1 + content.length,
    );
  }

  const inlineMatch = /^(`+)([\s\S]*?)\1$/u.exec(selected);

  if (inlineMatch) {
    const content = decodeCodeSpanContent(inlineMatch[2]);
    return replaceRange(
      selection,
      content,
      selection.start,
      selection.start + content.length,
    );
  }

  const content = selected || "code";
  const marker = "`".repeat(Math.max(1, longestBacktickRun(content) + 1));
  const needsPadding =
    content.startsWith("`")
    || content.endsWith("`")
    || (content.startsWith(" ") && content.endsWith(" ") && /\S/u.test(content));
  const padding = needsPadding ? " " : "";

  return replaceRange(
    selection,
    `${marker}${padding}${content}${padding}${marker}`,
    selection.start + marker.length + padding.length,
    selection.start + marker.length + padding.length + content.length,
  );
}

export function applyMarkdownCommand(
  command: MarkdownCommand,
  input: MarkdownSelection,
): MarkdownTransform {
  const selection = normalizeSelection(input);

  if (command === "bold" || command === "italic" || command === "strike") {
    const inlineCommand = INLINE_COMMANDS[command];
    return wrapSelection(selection, inlineCommand.marker, inlineCommand.placeholder);
  }

  if (command === "link" || command === "image") {
    return insertLink(selection, command === "image");
  }

  if (command === "code") {
    return insertCode(selection);
  }

  return transformSelectedLines(command, selection);
}

export function getMarkdownStats(value: string): MarkdownStats {
  return {
    words:
      value.match(/[\p{L}\p{N}]+(?:[’'_-][\p{L}\p{N}]+)*/gu)?.length ?? 0,
    characters: value.length,
  };
}
