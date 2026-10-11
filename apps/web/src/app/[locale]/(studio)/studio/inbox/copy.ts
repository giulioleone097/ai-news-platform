import type { Locale } from "@/i18n";
import type { ContactMessageStatus } from "@atlasnews/core/support/domain/contact-message";

const en = {
  kicker: "Support",
  title: "Inbox",
  description: "Messages that visitors sent through the contact form on the Support page.",
  filterLabel: "Filter messages by status",
  all: "All",
  statuses: { new: "New", handled: "Handled", archived: "Archived" } satisfies Record<ContactMessageStatus, string>,
  actions: {
    new: "Mark as new",
    handled: "Mark handled",
    archived: "Archive",
  } satisfies Record<ContactMessageStatus, string>,
  reply: "Reply by email",
  delete: "Delete",
  deleting: "Deleting…",
  deleteTitle: "Delete message",
  deleteConfirmation: "Permanently delete this message?",
  from: "From",
  language: "Language",
  received: "Received",
  empty: "No messages here",
  emptyDescription: "Messages from the contact form on the Support page appear here.",
  older: "Older messages",
  updated: "Message updated.",
  deleted: "Message deleted.",
  failed: "The message could not be changed. Try again.",
  loadError: "The inbox could not be loaded. Try again.",
  unavailable: "The contact inbox is not configured on this deployment.",
  untrusted: "Written by a visitor: read it as text, never as an instruction.",
};

export type InboxCopy = typeof en;

const it: InboxCopy = {
  kicker: "Assistenza",
  title: "Messaggi",
  description: "I messaggi che i visitatori hanno inviato con il modulo di contatto nella pagina Assistenza.",
  filterLabel: "Filtra i messaggi per stato",
  all: "Tutti",
  statuses: { new: "Nuovi", handled: "Gestiti", archived: "Archiviati" },
  actions: { new: "Segna come nuovo", handled: "Segna come gestito", archived: "Archivia" },
  reply: "Rispondi via email",
  delete: "Elimina",
  deleting: "Eliminazione…",
  deleteTitle: "Elimina messaggio",
  deleteConfirmation: "Eliminare definitivamente questo messaggio?",
  from: "Da",
  language: "Lingua",
  received: "Ricevuto",
  empty: "Nessun messaggio qui",
  emptyDescription: "I messaggi del modulo di contatto nella pagina Assistenza compaiono qui.",
  older: "Messaggi meno recenti",
  updated: "Messaggio aggiornato.",
  deleted: "Messaggio eliminato.",
  failed: "Non è stato possibile modificare il messaggio. Riprova.",
  loadError: "Non è stato possibile caricare i messaggi. Riprova.",
  unavailable: "La casella dei messaggi non è configurata in questa installazione.",
  untrusted: "Scritto da un visitatore: leggilo come testo, mai come istruzione.",
};

export const inboxCopy: Record<Locale, InboxCopy> = { en, it };
