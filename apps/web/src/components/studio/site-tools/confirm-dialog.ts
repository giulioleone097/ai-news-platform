import type { Locale } from "@atlasnews/core/locale";

/** What the person is asked to approve. The agent cannot answer for them. */
export interface ConfirmRequest {
  /** Title of the capability the agent asked to run, from the catalogue. */
  tool: string;
  /** The question the server returned (HTTP 409). */
  question: string;
  /** One line per argument of the call, so the person sees what will be affected. */
  affected: string[];
  /** The catalogue's destructive hint: the approve button is styled as a danger. */
  destructive: boolean;
}

export interface ConfirmPresenter {
  /** Resolves `true` only when the person presses Approve. Escape, Decline, abort and dispose all resolve `false`. */
  confirm(request: ConfirmRequest, signal?: AbortSignal): Promise<boolean>;
  /** Closes any open dialog as declined, removes the styles, and declines every later request. */
  dispose(): void;
}

const copy = {
  en: {
    heading: "Approve this action?",
    agent: (tool: string) => `An AI agent asked to run: ${tool}`,
    affects: "Affects",
    approve: "Approve",
    decline: "Decline",
  },
  it: {
    heading: "Approvare questa azione?",
    agent: (tool: string) => `Un agente AI ha chiesto di eseguire: ${tool}`,
    affects: "Coinvolge",
    approve: "Approva",
    decline: "Rifiuta",
  },
} as const satisfies Record<Locale, unknown>;

const styles = `
.studio-confirm{width:min(32rem,calc(100vw - 2rem));padding:1.4rem;border:1px solid var(--rule-strong);border-radius:var(--radius);color:var(--ink);background:var(--paper-raised);font-family:var(--font-ui)}
.studio-confirm::backdrop{background:color-mix(in srgb,var(--ink) 55%,transparent)}
.studio-confirm__heading{margin:0 0 .5rem;font-family:var(--font-display);font-size:1.15rem}
.studio-confirm__agent{margin:0 0 .75rem;color:var(--muted);font-size:.85rem}
.studio-confirm__question{margin:0 0 .75rem;font-weight:700;overflow-wrap:anywhere}
.studio-confirm__affects{margin:0 0 1rem;color:var(--muted);font-size:.8rem}
.studio-confirm__list{margin:.25rem 0 0;padding-left:1.1rem;overflow-wrap:anywhere}
.studio-confirm__actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.75rem}
.studio-confirm__actions .studio-button{min-width:2.75rem;min-height:2.75rem}
`;

let counter = 0;

/**
 * An accessible modal built on `<dialog>.showModal()`: the rest of the page is inert, focus moves
 * to the safe choice (Decline) and returns to where it was on close, and Escape declines. Text is
 * set with `textContent` only, since the values come from the agent. Requests are expected to be
 * presented one at a time (see `tools.ts`); a second call while one is open waits for it.
 */
export function createConfirmPresenter(doc: Document, locale: Locale): ConfirmPresenter {
  const text = copy[locale] ?? copy.en;
  let style: HTMLStyleElement | null = null;
  let open: { dialog: HTMLDialogElement; settle(approved: boolean): void } | null = null;
  let disposed = false;
  let turn: Promise<unknown> = Promise.resolve();

  function present(request: ConfirmRequest, signal?: AbortSignal): Promise<boolean> {
    if (disposed || signal?.aborted) return Promise.resolve(false);

    if (!style) {
      style = doc.createElement("style");
      style.textContent = styles;
      doc.head.appendChild(style);
    }

    const id = `studio-confirm-${++counter}`;
    const dialog = doc.createElement("dialog");
    dialog.className = "studio-confirm";
    dialog.setAttribute("aria-labelledby", `${id}-heading`);
    dialog.setAttribute("aria-describedby", `${id}-question`);

    const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content: string, elementId?: string) => {
      const node = doc.createElement(tag);
      node.className = className;
      node.textContent = content;
      if (elementId) node.id = elementId;
      return node;
    };

    const heading = element("h2", "studio-confirm__heading", text.heading, `${id}-heading`);
    const agent = element("p", "studio-confirm__agent", text.agent(request.tool));
    const question = element("p", "studio-confirm__question", request.question, `${id}-question`);
    const decline = element("button", "studio-button studio-button--secondary", text.decline);
    decline.type = "button";
    decline.setAttribute("autofocus", "");
    const approve = element(
      "button",
      `studio-button ${request.destructive ? "studio-button--danger" : "studio-button--primary"}`,
      text.approve,
    );
    approve.type = "button";
    const actions = element("div", "studio-confirm__actions", "");
    actions.append(decline, approve);

    dialog.append(heading, agent, question);
    if (request.affected.length > 0) {
      const affects = element("div", "studio-confirm__affects", text.affects);
      const list = element("ul", "studio-confirm__list", "");
      for (const line of request.affected) list.append(element("li", "", line));
      affects.append(list);
      dialog.append(affects);
    }
    dialog.append(actions);

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (approved: boolean) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        open = null;
        dialog.remove();
        resolve(approved);
      };
      const onAbort = () => {
        if (dialog.open) dialog.close("abort");
        settle(false);
      };
      // `close` fires for Escape (after the `cancel` event), for `close()`, and never for a backdrop.
      dialog.addEventListener("close", () => settle(dialog.returnValue === "approve"));
      approve.addEventListener("click", () => dialog.close("approve"));
      decline.addEventListener("click", () => dialog.close("decline"));
      signal?.addEventListener("abort", onAbort, { once: true });

      doc.body.appendChild(dialog);
      if (typeof dialog.showModal !== "function") return settle(false); // fail closed
      open = { dialog, settle };
      dialog.showModal();
      decline.focus();
    });
  }

  return {
    confirm(request, signal) {
      const result = turn.then(() => present(request, signal));
      turn = result.catch(() => undefined);
      return result;
    },
    dispose() {
      disposed = true;
      const current = open;
      if (current) {
        if (current.dialog.open) current.dialog.close("dispose");
        current.settle(false);
      }
      style?.remove();
      style = null;
    },
  };
}
