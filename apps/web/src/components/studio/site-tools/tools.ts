import { parseStudioInput, type ArticleFormSnapshot, type StudioToolInput, type StudioToolName } from "@atlasnews/contract/page";
import { guardTool, ToolFailure, type SiteTool, type ToolResult } from "@/components/site/site-tools/tools";
import type { OpenArticleForm } from "./article-form-bridge";

/** How long a page that has just opened is given to show its form: 60 looks of 50 ms. */
const formWaitLooks = 60;

/** What the Studio tools need from the browser; the real one is `start.ts`, tests pass a fake. */
export interface StudioToolsEnvironment {
  /** Moves the visible page and resolves `true` once the address bar shows `path`. */
  navigate(path: string): Promise<boolean>;
  /** The article form on screen now, or null on any other page. */
  articleForm(): OpenArticleForm | null;
  /** The path in the address bar. */
  path(): string;
  wait(ms: number): Promise<unknown>;
}

/** Whether the form on screen is the editor of this article (`slug`) or a new article of the locale. */
function isEditorOf(form: ArticleFormSnapshot, locale: string, slug?: string) {
  return slug ? form.article?.slug === slug && form.article.locale === locale : form.article === null && form.locale === locale;
}

/**
 * One handler per Studio page tool. They work on the editor open in the page and never call the server: the
 * person reads the form and presses Save, which runs the catalogue's capabilities with their checks.
 */
export function createStudioTools(env: StudioToolsEnvironment): Record<StudioToolName, SiteTool> {
  function openForm() {
    const form = env.articleForm();
    if (!form) throw new ToolFailure("No article form is open. Open one with open_article_editor first.");
    return form;
  }

  const run = {
    async open_article_editor({ locale, slug }: StudioToolInput<"open_article_editor">, signal?: AbortSignal) {
      const current = env.articleForm()?.read();
      if (current) {
        if (isEditorOf(current, locale, slug)) return { opened: true, path: env.path(), article: current.article };
        // Going to another editor would throw away what the person typed.
        if (current.unsaved) {
          throw new ToolFailure(
            "The article form on screen has unsaved changes. Ask the person to save or discard them before opening another article. Nothing was changed.",
          );
        }
      }

      const path = `/${locale}/studio/articles/${slug ?? "new"}`;
      if (!(await env.navigate(path))) throw new ToolFailure(`The page did not finish opening ${path}.`);
      // The form of the page we left can still be registered for a moment: wait for the one that was asked for.
      for (let look = 0; look < formWaitLooks; look++) {
        if (signal?.aborted) throw new Error("aborted");
        const snapshot = env.articleForm()?.read();
        if (snapshot && isEditorOf(snapshot, locale, slug)) return { opened: true, path: env.path(), article: snapshot.article };
        await env.wait(50);
      }
      throw new ToolFailure(slug ? `No article "${slug}" in locale ${locale}, or its editor did not open.` : "The article editor did not open.");
    },

    async read_article_form() {
      return openForm().read();
    },

    async fill_article_form(patch: StudioToolInput<"fill_article_form">) {
      return openForm().fill(patch);
    },
  } satisfies {
    [N in StudioToolName]: (input: StudioToolInput<N>, signal?: AbortSignal) => Promise<ToolResult>;
  };

  function guard<N extends StudioToolName>(name: N): SiteTool {
    const handler = run[name] as (input: StudioToolInput<N>, signal?: AbortSignal) => Promise<ToolResult>;
    return guardTool(name, (raw) => parseStudioInput(name, raw), handler);
  }

  return {
    open_article_editor: guard("open_article_editor"),
    read_article_form: guard("read_article_form"),
    fill_article_form: guard("fill_article_form"),
  };
}
