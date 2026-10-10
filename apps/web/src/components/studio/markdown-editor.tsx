"use client";

import dynamic from "next/dynamic";
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
  type KeyboardEvent,
  type ReactNode,
  useDeferredValue,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  applyMarkdownCommand,
  getMarkdownStats,
  type MarkdownCommand,
} from "@/lib/markdown-editor";

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
};

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
  const [content, setContent] = useState(defaultValue);
  const [mode, setMode] = useState<EditorMode>("write");
  const [activeToolIndex, setActiveToolIndex] = useState(0);
  const deferredContent = useDeferredValue(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef({ start: 0, end: 0, scrollTop: 0 });
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

  function runCommand(command: MarkdownCommand) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const result = applyMarkdownCommand(command, {
      value: content,
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    });

    selectionRef.current = {
      start: result.selectionStart,
      end: result.selectionEnd,
      scrollTop: textarea.scrollTop,
    };
    setContent(result.value);
    requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
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
                  onClick={() => runCommand(command)}
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
            <div className="studio-markdown__write-pane">
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
                onChange={(event) => setContent(event.target.value)}
                onKeyDown={handleKeyDown}
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
              />
            </div>
          ) : null}
        </div>

        <div className="studio-markdown__footer">
          <small id={helpId}>{help}</small>
          <output>
            {stats.words} {copy.words} · {stats.characters} {copy.characters}
          </output>
        </div>
      </div>
      {error}
    </div>
  );
}
