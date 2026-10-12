/**
 * The words of the error, not-found and loading boundaries. Those files are client components, so they read
 * this module and never a whole catalogue (both would otherwise ship in the JavaScript of every page).
 * `en.ts` and `it.ts` take these same strings for `common`, `errors` and `studio`, so each is written once.
 */
const en = {
  retry: "Try again",
  loading: "Loading…",
  dashboard: "Dashboard",
  genericTitle: "Something went wrong.",
  genericDescription: "We could not complete the request. Please try again.",
  notFoundTitle: "Page not found",
  notFoundDescription: "The link may be wrong, or the page may have moved.",
  backHome: "Back to home",
  latestStories: "Latest stories",
} as const;

const it = {
  retry: "Riprova",
  loading: "Caricamento…",
  dashboard: "Dashboard",
  genericTitle: "Qualcosa è andato storto.",
  genericDescription: "Non è stato possibile completare la richiesta. Riprova.",
  notFoundTitle: "Pagina non trovata",
  notFoundDescription: "Il link potrebbe essere sbagliato, o la pagina potrebbe essere stata spostata.",
  backHome: "Torna alla home",
  latestStories: "Ultime storie",
} as const satisfies Record<keyof typeof en, string>;

export const boundaryMessages = { en, it } as const;
