import type { Locale } from "@/i18n";

export interface CategoryCopy {
  listKicker: string;
  listTitle: string;
  listDescription: string;
  newCategory: string;
  english: string;
  italian: string;
  position: string;
  actions: string;
  edit: string;
  editCategory: string;
  delete: string;
  deleting: string;
  deleteConfirmation: (name: string) => string;
  emptyTitle: string;
  emptyDescription: string;
  saved: string;
  deleted: string;
  saveFailed: string;
  deleteFailed: string;
  newKicker: string;
  editKicker: string;
  cancel: string;
  save: string;
  saving: string;
  name: string;
  slug: string;
  slugPlaceholder: string;
  slugKeepHelp: string;
  description: string;
  positionHelp: string;
}

export const categoryCopy: Record<Locale, CategoryCopy> = {
  en: {
    listKicker: "Sections",
    listTitle: "Categories",
    listDescription: "The editorial sections of the site. Every category exists in English and Italian.",
    newCategory: "New category",
    english: "English",
    italian: "Italian",
    position: "Position",
    actions: "Actions",
    edit: "Edit",
    editCategory: "Edit category",
    delete: "Delete",
    deleting: "Deleting…",
    deleteConfirmation: (name) => `Permanently delete the category “${name}” in both languages?`,
    emptyTitle: "No categories yet",
    emptyDescription: "Create the first section of the site in English and Italian.",
    saved: "Category saved.",
    deleted: "Category deleted.",
    saveFailed: "The category could not be saved. Try again.",
    deleteFailed: "The category could not be deleted. Try again.",
    newKicker: "New category",
    editKicker: "Edit category",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving…",
    name: "Name",
    slug: "Slug",
    slugPlaceholder: "Taken from the name",
    slugKeepHelp: "Leave empty to keep the current slug.",
    description: "Description",
    positionHelp: "Order on the site, lowest first. Leave empty to add it last.",
  },
  it: {
    listKicker: "Sezioni",
    listTitle: "Categorie",
    listDescription: "Le sezioni editoriali del sito. Ogni categoria esiste in inglese e in italiano.",
    newCategory: "Nuova categoria",
    english: "Inglese",
    italian: "Italiano",
    position: "Posizione",
    actions: "Azioni",
    edit: "Modifica",
    editCategory: "Modifica categoria",
    delete: "Elimina",
    deleting: "Eliminazione…",
    deleteConfirmation: (name) => `Eliminare definitivamente la categoria “${name}” in entrambe le lingue?`,
    emptyTitle: "Nessuna categoria",
    emptyDescription: "Crea la prima sezione del sito in inglese e in italiano.",
    saved: "Categoria salvata.",
    deleted: "Categoria eliminata.",
    saveFailed: "La categoria non è stata salvata. Riprova.",
    deleteFailed: "La categoria non è stata eliminata. Riprova.",
    newKicker: "Nuova categoria",
    editKicker: "Modifica categoria",
    cancel: "Annulla",
    save: "Salva",
    saving: "Salvataggio…",
    name: "Nome",
    slug: "Slug",
    slugPlaceholder: "Ricavato dal nome",
    slugKeepHelp: "Lascia vuoto per mantenere lo slug attuale.",
    description: "Descrizione",
    positionHelp: "Ordine nel sito, dal più basso. Lascia vuoto per aggiungerla in fondo.",
  },
};
