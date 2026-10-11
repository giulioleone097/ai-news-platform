"use client";

import Image from "next/image";
import { ArrowLeft, Search } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { listEditorMediaAction, type EditorMediaItem } from "@/app/[locale]/(studio)/studio/actions";
import { altTextFromFileName, markdownImage } from "./markdown-media";

export type MediaPickerCopy = {
  search: string;
  library: string;
  loading: string;
  loadError: string;
  empty: string;
  noMatches: string;
  altLabel: string;
  altHelp: string;
  altRequired: string;
  back: string;
  insert: string;
  cancel: string;
};

type LibraryStatus = "loading" | "ready" | "error";

/** Keeps Enter inside these fields from submitting the article form the dialog sits in. */
function ignoreEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") event.preventDefault();
}

/**
 * A native modal dialog over the media library. The browser keeps focus inside it, closes it on
 * Escape and returns focus to the opener. Choosing an image asks for its alt text, then inserts
 * the Markdown through `onInsert`. The panel's state exists only while the dialog is open, so each
 * opening starts at the library with a fresh list.
 */
export function MediaPicker({
  copy,
  locale,
  onClose,
  onInsert,
  open,
  title,
}: {
  copy: MediaPickerCopy;
  locale: string;
  onClose: () => void;
  onInsert: (markdown: string) => void;
  open: boolean;
  title: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      aria-labelledby={titleId}
      className="studio-media-picker"
      onClose={onClose}
      ref={dialogRef}
    >
      {open ? (
        <MediaPickerPanel
          copy={copy}
          locale={locale}
          onCancel={onClose}
          onInsert={onInsert}
          title={title}
          titleId={titleId}
        />
      ) : null}
    </dialog>
  );
}

function MediaPickerPanel({
  copy,
  locale,
  onCancel,
  onInsert,
  title,
  titleId,
}: {
  copy: MediaPickerCopy;
  locale: string;
  onCancel: () => void;
  onInsert: (markdown: string) => void;
  title: string;
  titleId: string;
}) {
  const altRef = useRef<HTMLInputElement>(null);
  const altHelpId = useId();
  const altErrorId = useId();
  const [status, setStatus] = useState<LibraryStatus>("loading");
  const [items, setItems] = useState<EditorMediaItem[]>([]);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<EditorMediaItem | null>(null);
  const [alt, setAlt] = useState("");
  const [altError, setAltError] = useState(false);

  useEffect(() => {
    let current = true;
    listEditorMediaAction(locale)
      .then((result) => {
        if (!current) return;
        if (result.ok) {
          setItems(result.items);
          setStatus("ready");
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        if (current) setStatus("error");
      });
    return () => {
      current = false;
    };
  }, [locale]);

  useEffect(() => {
    if (chosen) altRef.current?.focus();
  }, [chosen]);

  const needle = query.trim().toLowerCase();
  const visible = needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;

  function choose(item: EditorMediaItem) {
    setChosen(item);
    setAlt(altTextFromFileName(item.name));
    setAltError(false);
  }

  function insert() {
    if (!chosen) return;
    const text = alt.trim();
    if (!text) {
      setAltError(true);
      altRef.current?.focus();
      return;
    }
    onInsert(markdownImage(text, chosen.url));
  }

  return (
    <div className="studio-media-picker__panel">
      <h2 className="studio-media-picker__title" id={titleId}>{title}</h2>
      {chosen ? (
        <div className="studio-media-picker__alt">
          <div className="studio-media-picker__chosen">
            {/* The thumbnail is decorative: the name beside it says which file is chosen. */}
            <Image alt="" className="studio-media-picker__thumb" height={96} src={chosen.url} unoptimized width={128} />
            <span>{chosen.name}</span>
          </div>
          <label className="studio-media-picker__field">
            <span>{copy.altLabel}</span>
            <input
              aria-describedby={`${altHelpId}${altError ? ` ${altErrorId}` : ""}`}
              aria-invalid={altError || undefined}
              onChange={(event) => {
                setAlt(event.target.value);
                setAltError(false);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                insert();
              }}
              ref={altRef}
              type="text"
              value={alt}
            />
          </label>
          <p className="studio-media-picker__help" id={altHelpId}>{copy.altHelp}</p>
          {altError ? (
            <p className="studio-media-picker__error" id={altErrorId} role="alert">{copy.altRequired}</p>
          ) : null}
        </div>
      ) : (
        <div className="studio-media-picker__library">
          <label className="studio-media-picker__field">
            <span>{copy.search}</span>
            <span className="studio-media-picker__search">
              <Search aria-hidden="true" size={16} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={ignoreEnter}
                type="search"
                value={query}
              />
            </span>
          </label>

          {status === "loading" ? <p className="studio-media-picker__help" role="status">{copy.loading}</p> : null}
          {status === "error" ? <p className="studio-media-picker__error" role="alert">{copy.loadError}</p> : null}
          {status === "ready" && !items.length ? <p className="studio-media-picker__help">{copy.empty}</p> : null}
          {status === "ready" && items.length > 0 && !visible.length ? (
            <p className="studio-media-picker__help">{copy.noMatches}</p>
          ) : null}

          {visible.length ? (
            <ul aria-label={copy.library} className="studio-media-picker__grid">
              {visible.map((item) => (
                <li key={item.path}>
                  <button className="studio-media-picker__item" onClick={() => choose(item)} type="button">
                    <Image alt="" className="studio-media-picker__thumb" height={96} loading="lazy" src={item.url} unoptimized width={128} />
                    <span>{item.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <div className="studio-media-picker__footer">
        {chosen ? (
          <button className="studio-button" onClick={() => setChosen(null)} type="button">
            <ArrowLeft aria-hidden="true" size={16} />
            <span>{copy.back}</span>
          </button>
        ) : null}
        <button className="studio-button" onClick={onCancel} type="button">
          {copy.cancel}
        </button>
        {chosen ? (
          <button className="studio-button studio-button--primary" onClick={insert} type="button">
            {copy.insert}
          </button>
        ) : null}
      </div>
    </div>
  );
}
