import type { Locale } from "@/i18n";
import type { BulkAction } from "./types";

interface BulkCopy {
  selectAllOnPage: string;
  selectArticle: (title: string) => string;
  selectedCount: (count: number) => string;
  actionsLabel: string;
  overLimit: (limit: number) => string;
  labels: Record<BulkAction, string>;
  confirm: Record<BulkAction, (count: number) => string>;
  done: Record<BulkAction, (count: number) => string>;
  noSelection: string;
  tooMany: (limit: number) => string;
  invalidRequest: string;
  failed: string;
}

export const bulkCopy: Record<Locale, BulkCopy> = {
  en: {
    selectAllOnPage: "Select all on this page",
    selectArticle: (title) => `Select ${title}`,
    selectedCount: (count) => (count === 1 ? "1 article selected" : `${count} articles selected`),
    actionsLabel: "Bulk actions",
    overLimit: (limit) => `Select at most ${limit} articles at a time to use these actions.`,
    labels: { publish: "Publish", unpublish: "Unpublish", delete: "Delete" },
    confirm: {
      publish: (count) => `Publish ${count === 1 ? "1 article" : `${count} articles`} on the public site?`,
      unpublish: (count) =>
        `Take ${count === 1 ? "1 article" : `${count} articles`} off the public site and return ${count === 1 ? "it" : "them"} to draft?`,
      delete: (count) =>
        `Permanently delete ${count === 1 ? "1 article" : `${count} articles`}? This cannot be undone.`,
    },
    done: {
      publish: (count) => `Published ${count === 1 ? "1 article" : `${count} articles`}.`,
      unpublish: (count) => `Unpublished ${count === 1 ? "1 article" : `${count} articles`}.`,
      delete: (count) => `Deleted ${count === 1 ? "1 article" : `${count} articles`}.`,
    },
    noSelection: "Select at least one article.",
    tooMany: (limit) => `Select at most ${limit} articles at a time.`,
    invalidRequest: "This request is not valid. Reload the page and try again.",
    failed: "The selected articles could not be updated. Try again.",
  },
  it: {
    selectAllOnPage: "Seleziona tutti in questa pagina",
    selectArticle: (title) => `Seleziona ${title}`,
    selectedCount: (count) => (count === 1 ? "1 articolo selezionato" : `${count} articoli selezionati`),
    actionsLabel: "Azioni multiple",
    overLimit: (limit) => `Seleziona al massimo ${limit} articoli alla volta per usare queste azioni.`,
    labels: { publish: "Pubblica", unpublish: "Annulla pubblicazione", delete: "Elimina" },
    confirm: {
      publish: (count) => `Pubblicare ${count === 1 ? "1 articolo" : `${count} articoli`} sul sito pubblico?`,
      unpublish: (count) =>
        `Togliere ${count === 1 ? "1 articolo" : `${count} articoli`} dal sito pubblico e riportar${count === 1 ? "lo" : "li"} in bozza?`,
      delete: (count) =>
        `Eliminare definitivamente ${count === 1 ? "1 articolo" : `${count} articoli`}? L'operazione non si può annullare.`,
    },
    done: {
      publish: (count) => `Pubblicat${count === 1 ? "o" : "i"} ${count === 1 ? "1 articolo" : `${count} articoli`}.`,
      unpublish: (count) => `Pubblicazione annullata per ${count === 1 ? "1 articolo" : `${count} articoli`}.`,
      delete: (count) => `Eliminat${count === 1 ? "o" : "i"} ${count === 1 ? "1 articolo" : `${count} articoli`}.`,
    },
    noSelection: "Seleziona almeno un articolo.",
    tooMany: (limit) => `Seleziona al massimo ${limit} articoli alla volta.`,
    invalidRequest: "Richiesta non valida. Ricarica la pagina e riprova.",
    failed: "Non è stato possibile aggiornare gli articoli selezionati. Riprova.",
  },
};
