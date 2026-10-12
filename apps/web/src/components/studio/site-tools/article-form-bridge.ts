import type { ArticleFormFill, ArticleFormPatch, ArticleFormSnapshot } from "@atlasnews/contract/page";

/**
 * The article form on screen as the page tools see it: a reader and a writer that the form registers while it is
 * mounted. The tools never look into the form's markup, and `fill` only moves the fields on screen: saving stays
 * the person's (the Save button runs the catalogue's capabilities with their checks).
 */
export interface OpenArticleForm {
  read(): ArticleFormSnapshot;
  /** Sets the fields of `patch` and returns at once what it set and what it refused; the screen shows them when it returns. */
  fill(patch: ArticleFormPatch): ArticleFormFill;
}

let open: OpenArticleForm | null = null;

/** Called by the form when it mounts; the function it returns unregisters it, and only if no other form took its place. */
export function registerOpenArticleForm(form: OpenArticleForm): () => void {
  open = form;
  return () => {
    if (open === form) open = null;
  };
}

/** The article form on screen now, or null on any other page. */
export function openArticleForm(): OpenArticleForm | null {
  return open;
}

export type FillRejection = ArticleFormFill["rejected"][number];

/** What the form itself offers: only the form knows its categories and the articles that a translation can link to. */
export interface FillOptions {
  /** Slugs of the categories of the article's locale. */
  categories: readonly string[];
  /** Slugs that the "Translation of" field offers. */
  translations: readonly string[];
  /** Slugs of the entities that the story can link. */
  entities: readonly string[];
}

const listed = (slugs: readonly string[]) =>
  slugs.length ? `${slugs.slice(0, 12).join(", ")}${slugs.length > 12 ? `, and ${slugs.length - 12} more` : ""}` : "none";

/** Splits a patch into what the form can take and what it must refuse, with the reason for each refusal. */
export function checkFill(patch: ArticleFormPatch, options: FillOptions) {
  const accepted: ArticleFormPatch = { ...patch };
  const rejected: FillRejection[] = [];
  const refuse = (field: keyof ArticleFormPatch, reason: string) => {
    delete accepted[field];
    rejected.push({ field, reason });
  };

  if (patch.categorySlug !== undefined && !options.categories.includes(patch.categorySlug)) {
    refuse("categorySlug", `No category "${patch.categorySlug}" in this article's locale. Categories: ${listed(options.categories)}.`);
  }
  if (typeof patch.translationOf === "string" && !options.translations.includes(patch.translationOf)) {
    refuse(
      "translationOf",
      `"${patch.translationOf}" is not offered. The form links only an article of the other language that has no translation yet: ${listed(options.translations)}.`,
    );
  }
  const unknown = patch.entities?.filter((entity) => !options.entities.includes(entity.slug)).map((entity) => entity.slug);
  if (unknown?.length) refuse("entities", `Unknown entities: ${listed(unknown)}. The list was left as it was.`);
  const filled = Object.keys(accepted).filter((field) => accepted[field as keyof ArticleFormPatch] !== undefined);
  return { accepted, filled, rejected };
}
