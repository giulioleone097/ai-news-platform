import type { Locale } from "@/i18n";

export interface TeamCopy {
  kicker: string;
  title: string;
  description: string;
  inviteTitle: string;
  email: string;
  emailHelp: string;
  name: string;
  nameHelp: string;
  role: string;
  roleEditor: string;
  roleAdmin: string;
  invite: string;
  inviting: string;
  members: string;
  member: string;
  status: string;
  actions: string;
  active: string;
  invited: string;
  you: string;
  saveRole: string;
  savingRole: string;
  remove: string;
  removing: string;
  removeConfirmation: (email: string) => string;
  sitesListNote: string;
  invitationSent: string;
  invitationSaved: string;
  roleUpdated: string;
  removed: string;
  forbidden: string;
  inviteFailed: string;
  roleFailed: string;
  removeFailed: string;
}

export const teamCopy: Record<Locale, TeamCopy> = {
  en: {
    kicker: "Newsroom",
    title: "Team",
    description: "Who can sign in to the Studio and the newsroom tools. Only admins see this page.",
    inviteTitle: "Invite someone",
    email: "Email address",
    emailHelp: "They sign in with this address.",
    name: "Display name (optional)",
    nameHelp: "Shown on their articles. Without it the part of the address before the @ is used.",
    role: "Role",
    roleEditor: "Editor",
    roleAdmin: "Admin",
    invite: "Invite",
    inviting: "Inviting…",
    members: "Team members",
    member: "Member",
    status: "Status",
    actions: "Actions",
    active: "Active",
    invited: "Invited",
    you: "You",
    saveRole: "Save role",
    savingRole: "Saving…",
    remove: "Remove",
    removing: "Removing…",
    removeConfirmation: (email) => `Remove ${email} from the team? They lose access to the Studio at once. Their articles stay.`,
    sitesListNote:
      "Someone who is on the site’s admin or editor email list joins again at their next sign-in, so removing them also needs that list edited.",
    invitationSent: "Invitation sent by email.",
    invitationSaved: "Invitation saved. No email is sent on this site: ask them to sign in with that address.",
    roleUpdated: "Role updated.",
    removed: "Team member removed.",
    forbidden: "Only admins can manage the team.",
    inviteFailed: "The invitation could not be saved. Try again.",
    roleFailed: "The role could not be changed. Try again.",
    removeFailed: "The team member could not be removed. Try again.",
  },
  it: {
    kicker: "Redazione",
    title: "Team",
    description: "Chi può accedere allo Studio e agli strumenti della redazione. Solo gli admin vedono questa pagina.",
    inviteTitle: "Invita una persona",
    email: "Indirizzo email",
    emailHelp: "Accede con questo indirizzo.",
    name: "Nome visualizzato (facoltativo)",
    nameHelp: "Appare sui suoi articoli. Senza nome si usa la parte dell’indirizzo prima della @.",
    role: "Ruolo",
    roleEditor: "Redattore",
    roleAdmin: "Amministratore",
    invite: "Invita",
    inviting: "Invito in corso…",
    members: "Membri del team",
    member: "Membro",
    status: "Stato",
    actions: "Azioni",
    active: "Attivo",
    invited: "Invitato",
    you: "Tu",
    saveRole: "Salva ruolo",
    savingRole: "Salvataggio…",
    remove: "Rimuovi",
    removing: "Rimozione…",
    removeConfirmation: (email) => `Rimuovere ${email} dal team? Perde subito l’accesso allo Studio. I suoi articoli restano.`,
    sitesListNote:
      "Chi è nell’elenco email degli admin o degli editor del sito rientra al prossimo accesso: per rimuoverlo va modificato anche l’elenco.",
    invitationSent: "Invito inviato via email.",
    invitationSaved: "Invito salvato. Su questo sito non viene inviata alcuna email: chiedi alla persona di accedere con quell’indirizzo.",
    roleUpdated: "Ruolo aggiornato.",
    removed: "Membro del team rimosso.",
    forbidden: "Solo gli admin possono gestire il team.",
    inviteFailed: "L’invito non è stato salvato. Riprova.",
    roleFailed: "Il ruolo non è stato cambiato. Riprova.",
    removeFailed: "Il membro del team non è stato rimosso. Riprova.",
  },
};
