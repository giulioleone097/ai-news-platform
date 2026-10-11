"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import {
  Bold,
  CheckSquare,
  Code2,
  Columns2,
  Eye,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  PenLine,
  Quote,
  Strikethrough,
} from "lucide-react";
import {
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useDeferredValue,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { getMessages } from "@/i18n";
import { isLocale } from "@atlasnews/core/locale";
import { uploadEditorMediaAction } from "@/app/[locale]/(studio)/studio/actions";
import {
  applyMarkdownCommand,
  getMarkdownStats,
  type MarkdownCommand,
} from "@/lib/markdown-editor";
import {
  altTextFromFileName,
  imageFileProblem,
  insertAtCursor,
  insertLine,
  markdownImage,
  maxEditorImagesPerDrop,
  removePlaceholder,
  replacePlaceholder,
  type TextEdit,
  type TextSelection,
  uniquePlaceholder,
} from "./markdown-media";
import { MediaPicker, type MediaPickerCopy } from "./media-picker";

const MarkdownPreview = dynamic(
  () => import("./markdown-preview").then((module) => module.MarkdownPreview),
  {
    loading: () => <div className="studio-markdown__preview-skeleton" aria-hidden="true" />,
    ssr: false,
  },
);

type EditorMode = "write" | "preview" | "split";

export type MarkdownEditorCopy = {
  toolbar: string;
  viewMode: string;
  write: string;
  preview: string;
  split: string;
  heading: string;
  bold: string;
  italic: string;
  strike: string;
  link: string;
  quote: string;
  bullets: string;
  numbered: string;
  checklist: string;
  code: string;
  image: string;
  words: string;
  characters: string;
  emptyPreview: string;
  imageUnavailable: string;
  /** Present where the Markdown is an article's: enables the media picker and drop or paste uploads. */
  images?: ImageInsertCopy;
};

export type ImageInsertCopy = MediaPickerCopy & {
  dropHint: string;
  uploading: string;
  uploadType: string;
  uploadSize: string;
  uploadBatch: string;
  uploadError: string;
  uploadConfiguration: string;
  dismiss: string;
};

type UploadFailure = "type" | "size" | "configuration" | "upload";
type UploadOutcome = Awaited<ReturnType<typeof uploadEditorMediaAction>>;

const toolbarItems: Array<{
  command: MarkdownCommand;
  icon: typeof Bold;
  label: keyof Pick<
    MarkdownEditorCopy,
    | "heading"
    | "bold"
    | "italic"
    | "strike"
    | "link"
    | "quote"
    | "bullets"
    | "numbered"
    | "checklist"
    | "code"
    | "image"
  >;
  shortcut?: string;
}> = [
  { command: "heading", icon: Heading2, label: "heading" },
  { command: "bold", icon: Bold, label: "bold", shortcut: "Ctrl/⌘B" },
  { command: "italic", icon: Italic, label: "italic", shortcut: "Ctrl/⌘I" },
  { command: "strike", icon: Strikethrough, label: "strike" },
  { command: "link", icon: Link2, label: "link", shortcut: "Ctrl/⌘K" },
  { command: "quote", icon: Quote, label: "quote" },
  { command: "bullets", icon: List, label: "bullets" },
  { command: "numbered", icon: ListOrdered, label: "numbered" },
  { command: "checklist", icon: CheckSquare, label: "checklist" },
  { command: "code", icon: Code2, label: "code" },
  // Opens the media picker instead of the bare `![image description](https://)` snippet.
  { command: "image", icon: ImageIcon, label: "image" },
];

const modes: Array<{
  value: EditorMode;
  icon: typeof PenLine;
  label: keyof Pick<MarkdownEditorCopy, "write" | "preview" | "split">;
}> = [
  { value: "write", icon: PenLine, label: "write" },
  { value: "preview", icon: Eye, label: "preview" },
  { value: "split", icon: Columns2, label: "split" },
];

/** Uploads one image through the Studio's media action; a network failure reads as an upload error. */
async function storeImage(locale: string, file: File): Promise<UploadOutcome> {
  const form = new FormData();
  form.set("locale", locale);
  form.set("asset", file);
  try {
    return await uploadEditorMediaAction(form);
  } catch {
    return { ok: false, error: "upload" };
  }
}

function uploadFailureMessage(copy: ImageInsertCopy, failure: UploadFailure) {
  const messages: Record<UploadFailure, string> = {
    type: copy.uploadType,
    size: copy.uploadSize,
    configuration: copy.uploadConfiguration,
    upload: copy.uploadError,
  };
  return messages[failure];
}

function carriesFiles(event: DragEvent<HTMLTextAreaElement>) {
  return Array.from(event.dataTransfer.types).includes("Files");
}

export function MarkdownEditor({
  copy,
  defaultValue = "",
  error,
  errorId,
  help,
  invalid = false,
  label,
}: {
  copy: MarkdownEditorCopy;
  defaultValue?: string;
  error?: ReactNode;
  errorId: string;
  help: string;
  invalid?: boolean;
  label: string;
}) {
  const params = useParams<{ locale?: string }>();
  const locale = isLocale(params.locale) ? params.locale : "en";
  const images = copy.images;
  const markdownLabels = getMessages(locale).markdown;
  const [content, setContent] = useState(defaultValue);
  const [mode, setMode] = useState<EditorMode>("write");
  const [activeToolIndex, setActiveToolIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [uploadNotice, setUploadNotice] = useState("");
  const deferredContent = useDeferredValue(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef({ start: 0, end: 0, scrollTop: 0 });
  // Uploads finish after the author may have typed on: they read the latest text from this ref, not a
  // stale closure, and their caret restore is applied after the render that shows their change.
  const contentRef = useRef(defaultValue);
  const pendingSelectionRef = useRef<TextSelection | null>(null);
  const uploadsInFlightRef = useRef<string[]>([]);
  const stats = getMarkdownStats(content);
  const helpId = "article-content-help";

  function rememberSelection(textarea = textareaRef.current) {
    if (!textarea) return;
    selectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      scrollTop: textarea.scrollTop,
    };
  }

  function currentSelection(): TextSelection {
    const textarea = textareaRef.current;
    return textarea ? { start: textarea.selectionStart, end: textarea.selectionEnd } : selectionRef.current;
  }

  /** Every change to the text goes through here, so the ref and the rendered value never disagree. */
  function commit(next: string, selection?: TextSelection) {
    contentRef.current = next;
    if (selection) pendingSelectionRef.current = selection;
    setContent(next);
  }

  function changeMode(nextMode: EditorMode) {
    rememberSelection();
    setMode(nextMode);
  }

  useLayoutEffect(() => {
    if (mode === "preview") return;
    const textarea = textareaRef.current;
    if (!textarea) return;

    const selection = selectionRef.current;
    textarea.setSelectionRange(selection.start, selection.end);
    textarea.scrollTop = selection.scrollTop;
  }, [mode]);

  useLayoutEffect(() => {
    const pending = pendingSelectionRef.current;
    pendingSelectionRef.current = null;
    const textarea = textareaRef.current;
    if (!pending || !textarea) return;

    textarea.setSelectionRange(pending.start, pending.end);
    selectionRef.current = { ...selectionRef.current, ...pending };
  }, [content]);

  function runCommand(command: MarkdownCommand) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const result = applyMarkdownCommand(command, {
      value: contentRef.current,
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    });

    selectionRef.current = {
      start: result.selectionStart,
      end: result.selectionEnd,
      scrollTop: textarea.scrollTop,
    };
    commit(result.value);
    requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  function openImagePicker() {
    rememberSelection();
    setPickerOpen(true);
  }

  function insertFromPicker(markdown: string) {
    const textarea = textareaRef.current;
    const edit = insertAtCursor(contentRef.current, currentSelection(), markdown);
    commit(edit.value, edit.selection);
    setPickerOpen(false);
    requestAnimationFrame(() => textarea?.focus({ preventScroll: true }));
  }

  /**
   * Inserts a placeholder line per image at the caret, uploads them one after another, then replaces
   * each placeholder with its image or removes it with a message.
   */
  async function uploadImages(files: File[], imageCopy: ImageInsertCopy) {
    if (!textareaRef.current || files.length === 0) return;

    const problems: string[] = [];
    if (files.length > maxEditorImagesPerDrop) problems.push(imageCopy.uploadBatch);
    const queued: Array<{ file: File; placeholder: string }> = [];
    let caret = currentSelection();
    for (const file of files.slice(0, maxEditorImagesPerDrop)) {
      const problem = imageFileProblem(file);
      if (problem) {
        problems.push(`${file.name}: ${uploadFailureMessage(imageCopy, problem)}`);
        continue;
      }
      const placeholder = uniquePlaceholder(
        `${imageCopy.uploading} ${file.name}`,
        (candidate) => uploadsInFlightRef.current.includes(candidate) || contentRef.current.includes(candidate),
      );
      uploadsInFlightRef.current.push(placeholder);
      const edit: TextEdit = insertLine(contentRef.current, caret, placeholder);
      commit(edit.value, edit.selection);
      caret = edit.selection;
      queued.push({ file, placeholder });
    }
    setUploadErrors(problems);

    for (const { file, placeholder } of queued) {
      setUploadNotice(`${imageCopy.uploading} ${file.name}`);
      const outcome = await storeImage(locale, file);
      uploadsInFlightRef.current = uploadsInFlightRef.current.filter((item) => item !== placeholder);
      if (outcome.ok) {
        const edit = replacePlaceholder(
          contentRef.current,
          currentSelection(),
          placeholder,
          markdownImage(altTextFromFileName(file.name), outcome.asset.url),
        );
        commit(edit.value, edit.selection);
      } else {
        const edit = removePlaceholder(contentRef.current, currentSelection(), placeholder);
        commit(edit.value, edit.selection);
        setUploadErrors((previous) => [
          ...previous,
          `${file.name}: ${uploadFailureMessage(imageCopy, outcome.error)}`,
        ]);
      }
    }
    setUploadNotice("");
  }

  function handleDragOver(event: DragEvent<HTMLTextAreaElement>) {
    if (!images || !carriesFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }

  function handleDrop(event: DragEvent<HTMLTextAreaElement>) {
    if (!images || !carriesFiles(event)) return;
    event.preventDefault();
    setDragging(false);
    event.currentTarget.focus({ preventScroll: true });
    void uploadImages(Array.from(event.dataTransfer.files), images);
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!images) return;
    const pasted = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    // Text pastes keep the browser's default; only copied image files are taken over.
    if (pasted.length === 0) return;
    event.preventDefault();
    void uploadImages(pasted, images);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const modifier = event.metaKey || event.ctrlKey;
    if (!modifier) return;

    const command = event.key.toLowerCase();
    if (command === "b" || command === "i" || command === "k") {
      event.preventDefault();
      runCommand(command === "b" ? "bold" : command === "i" ? "italic" : "link");
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function handleToolbarKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex < 0 || buttons.length === 0) return;

    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    setActiveToolIndex(nextIndex);
    buttons[nextIndex]?.focus();
  }

  return (
    <div className="studio-field studio-markdown">
      <div className="studio-markdown__heading">
        <span id="article-content-label">{label}</span>
        <div className="studio-markdown__modes" role="group" aria-label={copy.viewMode}>
          {modes.map(({ value, icon: Icon, label: labelKey }) => (
            <button
              aria-pressed={mode === value}
              className="studio-markdown__mode"
              key={value}
              onClick={() => changeMode(value)}
              type="button"
            >
              <Icon aria-hidden="true" size={15} />
              <span>{copy[labelKey]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="studio-markdown__shell">
        {(mode === "write" || mode === "split") ? (
          <div
            className="studio-markdown__toolbar"
            role="toolbar"
            aria-label={copy.toolbar}
            onKeyDown={handleToolbarKeyDown}
          >
            {toolbarItems.map(({ command, icon: Icon, label: labelKey, shortcut }, index) => {
              const buttonLabel = copy[labelKey];
              return (
                <button
                  aria-label={buttonLabel}
                  className="studio-markdown__tool"
                  key={command}
                  onClick={() => (command === "image" && images ? openImagePicker() : runCommand(command))}
                  onFocus={() => setActiveToolIndex(index)}
                  tabIndex={activeToolIndex === index ? 0 : -1}
                  title={shortcut ? `${buttonLabel} (${shortcut})` : buttonLabel}
                  type="button"
                >
                  <Icon aria-hidden="true" size={18} />
                  <span className="sr-only">{buttonLabel}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className={`studio-markdown__workspace studio-markdown__workspace--${mode}`}>
          {mode === "preview" ? <input name="content" type="hidden" value={content} /> : null}
          {(mode === "write" || mode === "split") ? (
            <div className={`studio-markdown__write-pane${dragging ? " studio-markdown__write-pane--dragging" : ""}`}>
              <textarea
                aria-describedby={`${helpId}${invalid ? ` ${errorId}` : ""}`}
                aria-invalid={invalid || undefined}
                aria-labelledby="article-content-label"
                autoCapitalize="sentences"
                autoCorrect="on"
                id="article-content"
                maxLength={100_000}
                minLength={20}
                name="content"
                onChange={(event) => commit(event.target.value)}
                onDragLeave={() => setDragging(false)}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onScroll={(event) => rememberSelection(event.currentTarget)}
                onSelect={(event) => rememberSelection(event.currentTarget)}
                ref={textareaRef}
                required
                rows={22}
                spellCheck
                value={content}
              />
            </div>
          ) : null}

          {(mode === "preview" || mode === "split") ? (
            <div
              className="studio-markdown__preview"
              aria-labelledby="article-content-label"
              role="region"
            >
              <MarkdownPreview
                content={deferredContent}
                emptyLabel={copy.emptyPreview}
                imageUnavailableLabel={copy.imageUnavailable}
                labels={markdownLabels}
              />
            </div>
          ) : null}
        </div>

        {images && uploadErrors.length ? (
          <div className="studio-markdown__notices" role="alert">
            <ul>
              {uploadErrors.map((message, index) => (
                <li key={`${index}-${message}`}>{message}</li>
              ))}
            </ul>
            <button className="studio-button" onClick={() => setUploadErrors([])} type="button">
              {images.dismiss}
            </button>
          </div>
        ) : null}
        <p className="sr-only" role="status">{uploadNotice}</p>

        <div className="studio-markdown__footer">
          <small id={helpId}>{help}</small>
          {images ? <small className="studio-markdown__drop-hint">{images.dropHint}</small> : null}
          <output>
            {stats.words} {copy.words} · {stats.characters} {copy.characters}
          </output>
        </div>
      </div>
      {images ? (
        <MediaPicker
          copy={images}
          locale={locale}
          onClose={() => setPickerOpen(false)}
          onInsert={insertFromPicker}
          open={pickerOpen}
          title={copy.image}
        />
      ) : null}
      {error}
    </div>
  );
}
