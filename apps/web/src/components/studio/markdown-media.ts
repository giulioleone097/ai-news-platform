/**
 * Text edits behind the Markdown editor's image insertion. Pure functions over the textarea value
 * and selection, so the caret rules are testable without a browser.
 */

import { maxMediaBytes, mediaImageTypes } from "@atlasnews/core/editorial/domain/editorial-image";
import { mediaBatchLimit } from "@atlasnews/core/editorial/domain/errors";

export type TextSelection = { start: number; end: number };
export type TextEdit = { value: string; selection: TextSelection };

/** The batch limit the media capabilities use for one call. */
export const maxEditorImagesPerDrop = mediaBatchLimit;

export type ImageFileProblem = "type" | "size";

export function imageFileProblem(file: { type: string; size: number }): ImageFileProblem | null {
  if (!(mediaImageTypes as readonly string[]).includes(file.type)) return "type";
  if (!file.size || file.size > maxMediaBytes) return "size";
  return null;
}

/** Markdown image syntax. Brackets in the alt text and spaces or parentheses in the URL are escaped. */
export function markdownImage(alt: string, url: string) {
  const label = alt.replace(/[\\[\]]/g, (char) => `\\${char}`).replace(/\s+/g, " ").trim();
  // encodeURIComponent leaves parentheses alone, so each delimiter is percent-encoded by code point.
  const destination = url.replace(
    /[\s()<>]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
  return `![${label}](${destination})`;
}

/** The alt text the editor proposes: the file name without its extension, with separators as spaces. */
export function altTextFromFileName(fileName: string) {
  return fileName
    .replace(/\.[^.]*$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A unique placeholder line: `base`, or `base (2)`, `base (3)` … while `isTaken` says the text is in use. */
export function uniquePlaceholder(base: string, isTaken: (candidate: string) => boolean) {
  let candidate = base;
  for (let n = 2; isTaken(candidate); n += 1) candidate = `${base} (${n})`;
  return candidate;
}

function clampSelection(selection: TextSelection, length: number): TextSelection {
  const clamp = (position: number) => (Number.isFinite(position) ? Math.min(length, Math.max(0, Math.trunc(position))) : 0);
  const first = clamp(selection.start);
  const second = clamp(selection.end);
  return { start: Math.min(first, second), end: Math.max(first, second) };
}

/**
 * Replaces `[from, to)` with `text`. A caret before the span stays; one after it moves with the
 * length change; one inside the span lands at the end of the replacement.
 */
function splice(value: string, selection: TextSelection, from: number, to: number, text: string): TextEdit {
  const delta = text.length - (to - from);
  const mapPosition = (position: number) => {
    if (position < from) return position;
    if (position >= to) return position + delta;
    return from + text.length;
  };
  const current = clampSelection(selection, value.length);
  return {
    value: value.slice(0, from) + text + value.slice(to),
    selection: { start: mapPosition(current.start), end: mapPosition(current.end) },
  };
}

/** Inserts at the cursor, replacing any selected text; the caret ends after the inserted text. */
export function insertAtCursor(value: string, selection: TextSelection, text: string): TextEdit {
  const { start, end } = clampSelection(selection, value.length);
  return splice(value, { start, end }, start, end, text);
}

/** Inserts `line` on a line of its own, adding a line break before or after only when the text needs one. */
export function insertLine(value: string, selection: TextSelection, line: string): TextEdit {
  const { start, end } = clampSelection(selection, value.length);
  const lead = start > 0 && value[start - 1] !== "\n" ? "\n" : "";
  const following = value.slice(end, end + 1);
  const trail = following !== "" && following !== "\n" ? "\n" : "";
  const edit = splice(value, { start, end }, start, end, `${lead}${line}${trail}`);
  const caret = start + lead.length + line.length;
  return { value: edit.value, selection: { start: caret, end: caret } };
}

/**
 * Replaces the placeholder line with the finished Markdown. When the author has already deleted the
 * placeholder, the Markdown is appended at the end instead, so a finished upload is never lost.
 */
export function replacePlaceholder(
  value: string,
  selection: TextSelection,
  placeholder: string,
  replacement: string,
): TextEdit {
  const index = value.indexOf(placeholder);
  if (index < 0) {
    const lead = value && !value.endsWith("\n") ? "\n" : "";
    const next = `${value}${lead}${replacement}`;
    return { value: next, selection: clampSelection(selection, next.length) };
  }
  return splice(value, selection, index, index + placeholder.length, replacement);
}

/** Removes the placeholder line with its line break. A missing placeholder leaves the text unchanged. */
export function removePlaceholder(value: string, selection: TextSelection, placeholder: string): TextEdit {
  const index = value.indexOf(placeholder);
  if (index < 0) return { value, selection: clampSelection(selection, value.length) };
  const to = index + placeholder.length + (value[index + placeholder.length] === "\n" ? 1 : 0);
  return splice(value, selection, index, to, "");
}
