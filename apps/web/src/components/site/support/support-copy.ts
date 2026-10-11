import type { Locale } from "@/i18n";

/**
 * Words of the Support, Privacy and Terms pages. The two legal pages are templates that describe what this
 * app processes; the owner must review them legally and fill in the controller's name and contact
 * (docs/AGENT_PLUGIN.md, "Support, privacy and terms pages").
 */

export interface PageSection {
  id: string;
  heading: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
}

export interface LegalCopy {
  title: string;
  description: string;
  updatedLabel: string;
  /** ISO date of the last change to the text. */
  updated: string;
  intro: string;
  sections: readonly PageSection[];
}

export interface ContactCopy {
  title: string;
  description: string;
  name: string;
  email: string;
  subject: string;
  body: string;
  bodyHint: string;
  submit: string;
  submitting: string;
  success: string;
  privacyBefore: string;
  privacyLink: string;
  privacyAfter: string;
  errorSummary: string;
  errors: {
    name: string;
    email: string;
    subject: string;
    body: string;
    rateLimited: string;
    unavailable: string;
    network: string;
  };
}

export interface SupportCopy {
  title: string;
  description: string;
  kicker: string;
  faqLabel: string;
  faq: readonly PageSection[];
  relatedLabel: string;
  privacy: string;
  terms: string;
  contact: ContactCopy;
}

const en: SupportCopy = {
  title: "Support",
  description: "Help with AtlasNews: what it is, how to report a comment, how to unsubscribe, how editors sign in and how to write to us.",
  kicker: "Help",
  faqLabel: "Common questions",
  faq: [
    {
      id: "what-is-atlasnews",
      heading: "What is AtlasNews?",
      paragraphs: [
        "AtlasNews is an English and Italian publication about artificial intelligence. Every story shows how settled its claim is (confirmed, rolling out, in test, rumour or analysis) and the sources behind it. The site shows no advertisements.",
        "AI assistants can read the published stories and, for signed-in editors, run the newsroom through the AtlasNews plugin and its MCP server.",
      ],
    },
    {
      id: "report-a-comment",
      heading: "How do I report a comment?",
      paragraphs: [
        "Open the story, find the comment and choose Report under it. Pick a reason and, if you like, add details. The editors review every report. Comments are checked by the editors before they appear.",
      ],
    },
    {
      id: "unsubscribe",
      heading: "How do I unsubscribe from the newsletter?",
      paragraphs: [
        "Every briefing email ends with an unsubscribe link. Open it and confirm. If you no longer have the email, write to us with the form below from the address you subscribed with and we will remove it.",
      ],
    },
    {
      id: "editor-sign-in",
      heading: "How do editors sign in?",
      paragraphs: [
        "Editors open the Studio from the footer and sign in with the address they were invited with, using ChatGPT, Google or GitHub where the site offers them, or email and password on a self-hosted one. If you are signed in but not an editor, ask an admin of the site to add your address. Readers do not need an account; signing in only lets you comment under your name.",
      ],
    },
    {
      id: "assistant-problem",
      heading: "Something does not work in ChatGPT or Claude",
      paragraphs: [
        "Use the form below and tell us which assistant you use, which tool you called and what you asked. Do not send passwords or access tokens.",
      ],
    },
  ],
  relatedLabel: "Policies",
  privacy: "Privacy policy",
  terms: "Terms of service",
  contact: {
    title: "Write to us",
    description: "Questions, corrections, privacy requests or problems with the site. Write in English or Italian.",
    name: "Your name",
    email: "Your email",
    subject: "Subject",
    body: "Message",
    bodyHint: "10 to 4,000 characters.",
    submit: "Send message",
    submitting: "Sending…",
    success: "Thank you. Your message has been sent.",
    privacyBefore: "We use these details only to answer you. See the",
    privacyLink: "privacy policy",
    privacyAfter: ".",
    errorSummary: "Check the highlighted fields and send the message again.",
    errors: {
      name: "Enter your name, 2 to 100 characters.",
      email: "Enter a valid email address.",
      subject: "Enter a subject, 3 to 150 characters, on one line.",
      body: "Write a message of 10 to 4,000 characters.",
      rateLimited: "You have written several times in a short while. Please try again in a few minutes.",
      unavailable: "The message could not be sent. Please try again later.",
      network: "The connection failed. Check it and try again.",
    },
  },
};

const it: SupportCopy = {
  title: "Assistenza",
  description: "Aiuto su AtlasNews: cos'è, come segnalare un commento, come disiscriversi, come accedono i redattori e come scriverci.",
  kicker: "Aiuto",
  faqLabel: "Domande frequenti",
  faq: [
    {
      id: "what-is-atlasnews",
      heading: "Che cos'è AtlasNews?",
      paragraphs: [
        "AtlasNews è una testata in inglese e italiano sull'intelligenza artificiale. Ogni storia indica quanto è solida l'affermazione (confermata, in rilascio, in test, voce o analisi) e le fonti che la sostengono. Il sito non mostra pubblicità.",
        "Gli assistenti AI possono leggere le storie pubblicate e, per i redattori che hanno effettuato l'accesso, usare la redazione tramite il plugin AtlasNews e il suo server MCP.",
      ],
    },
    {
      id: "report-a-comment",
      heading: "Come segnalo un commento?",
      paragraphs: [
        "Apri la storia, trova il commento e scegli Segnala sotto di esso. Indica un motivo e, se vuoi, aggiungi dettagli. I redattori esaminano ogni segnalazione. I commenti vengono controllati dai redattori prima di comparire.",
      ],
    },
    {
      id: "unsubscribe",
      heading: "Come mi disiscrivo dalla newsletter?",
      paragraphs: [
        "Ogni email del briefing termina con un link per annullare l'iscrizione. Aprilo e conferma. Se non hai più l'email, scrivici con il modulo qui sotto dall'indirizzo con cui ti sei iscritto e lo rimuoveremo.",
      ],
    },
    {
      id: "editor-sign-in",
      heading: "Come accedono i redattori?",
      paragraphs: [
        "I redattori aprono lo Studio dal piè di pagina e accedono con l'indirizzo con cui sono stati invitati, usando ChatGPT, Google o GitHub dove il sito li offre, oppure email e password su un'installazione propria. Se hai effettuato l'accesso ma non sei un redattore, chiedi a un amministratore del sito di aggiungere il tuo indirizzo. I lettori non hanno bisogno di un account: l'accesso serve solo a commentare con il proprio nome.",
      ],
    },
    {
      id: "assistant-problem",
      heading: "Qualcosa non funziona in ChatGPT o Claude",
      paragraphs: [
        "Usa il modulo qui sotto e indicaci quale assistente usi, quale strumento hai chiamato e cosa hai chiesto. Non inviare password né token di accesso.",
      ],
    },
  ],
  relatedLabel: "Informative",
  privacy: "Informativa sulla privacy",
  terms: "Termini di servizio",
  contact: {
    title: "Scrivici",
    description: "Domande, correzioni, richieste sulla privacy o problemi con il sito. Scrivi in italiano o in inglese.",
    name: "Il tuo nome",
    email: "La tua email",
    subject: "Oggetto",
    body: "Messaggio",
    bodyHint: "Da 10 a 4.000 caratteri.",
    submit: "Invia messaggio",
    submitting: "Invio…",
    success: "Grazie. Il tuo messaggio è stato inviato.",
    privacyBefore: "Usiamo questi dati solo per risponderti. Leggi",
    privacyLink: "l'informativa sulla privacy",
    privacyAfter: ".",
    errorSummary: "Controlla i campi evidenziati e invia di nuovo il messaggio.",
    errors: {
      name: "Inserisci il tuo nome, da 2 a 100 caratteri.",
      email: "Inserisci un indirizzo email valido.",
      subject: "Inserisci un oggetto, da 3 a 150 caratteri, su una riga.",
      body: "Scrivi un messaggio da 10 a 4.000 caratteri.",
      rateLimited: "Hai scritto più volte in poco tempo. Riprova tra qualche minuto.",
      unavailable: "Non è stato possibile inviare il messaggio. Riprova più tardi.",
      network: "La connessione non ha funzionato. Controllala e riprova.",
    },
  },
};

export const supportCopy: Record<Locale, SupportCopy> = { en, it };

const privacyEn: LegalCopy = {
  title: "Privacy policy",
  description: "What personal data AtlasNews processes when you read, comment, subscribe, write to us or sign in, why, and what you can ask of us.",
  updatedLabel: "Last updated",
  updated: "2026-10-11",
  intro: "AtlasNews collects as little as it needs. There are no advertisements, no analytics and no third-party trackers on this site. This page says what is processed, why, who else handles it and how to exercise your rights.",
  sections: [
    {
      id: "who",
      heading: "Who is responsible",
      paragraphs: [
        "AtlasNews, the publisher of this site, decides why and how the data below is processed. For any question or request about your data, use the form on the Support page.",
      ],
    },
    {
      id: "reading",
      heading: "Reading the site",
      paragraphs: [
        "You do not need an account to read. Like every web server, ours and our hosting provider's record technical details of each request (network address, browser, requested page, time) in server logs, to deliver the site, keep it secure and find faults.",
        "Stories you save are kept only in your browser's local storage on your device. They are never sent to us.",
      ],
    },
    {
      id: "comments",
      heading: "Comments",
      paragraphs: [
        "When you comment we store the name you typed, the text, the language, the time and the story it belongs to. An approved comment is public, with that name. If you are not signed in, we set one cookie (atlasnews_comment_guest, valid for one year) that holds a random, signed identifier so that you can edit or delete your own comment for a limited time and so that we can limit abuse. If you are signed in, we link the comment to your account identifier instead.",
        "If you ask for email about replies and moderation, we store your address for that purpose only, after you confirm it, and send those emails through our email provider. If you report a comment, we store the reason, the details you add and who reported it.",
      ],
    },
    {
      id: "newsletter",
      heading: "Newsletter",
      paragraphs: [
        "To send the briefing we store your email address, the language, where you subscribed and when you consented. We first email you a confirmation link and subscribe you only after you open it. Every briefing contains an unsubscribe link. After you unsubscribe we keep the address marked as unsubscribed, and, if a message bounced or was reported as spam, a one-way hash of it, so that we do not email you again.",
        "Emails are sent through Resend, which receives the address, the message and delivery events (delivered, bounced, opened, clicked).",
      ],
    },
    {
      id: "contact",
      heading: "Messages you send us",
      paragraphs: [
        "The contact form stores your name, email address, subject, message, the language of the page and the time. Our editors read it in the Studio and with their tools, to answer you and to improve the site. We delete messages when they are no longer needed.",
        "To stop abuse we count messages per network. The counter holds a one-way hash of your network address, not the address or the message, and is deleted after a day without messages.",
      ],
    },
    {
      id: "sign-in",
      heading: "Signing in",
      paragraphs: [
        "Editors, and readers where sign-in is offered, sign in with ChatGPT, Google or GitHub where the site offers them, or with the email and password of a self-hosted deployment. The provider you choose tells the site your account identifier, a verified email address and your name (GitHub: your primary verified email). We use them to recognise you, to attribute stories and comments, and to give editors their access. We do not receive your ChatGPT conversations.",
      ],
    },
    {
      id: "cookies",
      heading: "Cookies and local storage",
      items: [
        "atlasnews_comment_guest: only after you post a comment without signing in; one year; identifies your own comments.",
        "Sign-in session: set by the site or the sign-in provider only if you sign in; needed to keep you signed in. A short-lived cookie also protects the sign-in step with Google or GitHub.",
        "Saved stories: browser local storage, never leaves your device.",
        "We set no advertising, analytics or tracking cookies.",
      ],
    },
    {
      id: "basis",
      heading: "Why we may process it",
      items: [
        "Your consent: the newsletter, email about your comments, and the comment cookie where the law asks for it. You can withdraw it at any time.",
        "Our legitimate interest in running a safe publication: server logs, abuse limits, moderation and answering your messages.",
        "Taking the steps you ask for, such as replying to your message or publishing your comment.",
        "Legal obligations, where they apply.",
      ],
    },
    {
      id: "recipients",
      heading: "Who else handles your data",
      items: [
        "The hosting provider that runs the site and its database and file storage.",
        "Resend, to send confirmation, newsletter and notification emails.",
        "OpenAI, Google or GitHub, if you sign in with them, or the authentication provider of a self-hosted deployment.",
      ],
      paragraphs: [
        "These providers act for us under their own terms. Data may be processed outside your country, under the safeguards the law requires. We do not sell your data.",
      ],
    },
    {
      id: "keeping",
      heading: "How long we keep it",
      paragraphs: [
        "Comments stay until you or a moderator delete them. Newsletter data stays while you are subscribed, then only the unsubscribed marker or hash described above. Messages stay until we have answered and no longer need them. Server logs are kept by the hosting provider for a short period.",
      ],
    },
    {
      id: "rights",
      heading: "Your rights",
      paragraphs: [
        "You can ask us to give you access to your data, correct it, delete it, restrict or stop its use, or send it to you in a portable form, and you can withdraw consent at any time. Write to us with the form on the Support page from the address concerned. You can also complain to your data protection authority; in Italy this is the Garante per la protezione dei dati personali.",
      ],
    },
    {
      id: "changes",
      heading: "Changes",
      paragraphs: [
        "When we change what we process, we update this page and its date.",
      ],
    },
  ],
};

const privacyIt: LegalCopy = {
  title: "Informativa sulla privacy",
  description: "Quali dati personali tratta AtlasNews quando leggi, commenti, ti iscrivi, ci scrivi o accedi, perché, e cosa puoi chiederci.",
  updatedLabel: "Ultimo aggiornamento",
  updated: "2026-10-11",
  intro: "AtlasNews raccoglie solo ciò che serve. Sul sito non ci sono pubblicità, strumenti di analisi né tracker di terze parti. Questa pagina spiega cosa viene trattato, perché, chi altro lo gestisce e come esercitare i tuoi diritti.",
  sections: [
    {
      id: "who",
      heading: "Chi è responsabile",
      paragraphs: [
        "AtlasNews, l'editore di questo sito, decide perché e come vengono trattati i dati qui sotto. Per qualsiasi domanda o richiesta sui tuoi dati usa il modulo nella pagina Assistenza.",
      ],
    },
    {
      id: "reading",
      heading: "Leggere il sito",
      paragraphs: [
        "Per leggere non serve un account. Come ogni server web, il nostro e quello del fornitore di hosting registrano nei log i dettagli tecnici di ogni richiesta (indirizzo di rete, browser, pagina richiesta, orario) per erogare il sito, mantenerlo sicuro e individuare i guasti.",
        "Le storie che salvi restano solo nella memoria locale del tuo browser, sul tuo dispositivo. Non ci vengono mai inviate.",
      ],
    },
    {
      id: "comments",
      heading: "Commenti",
      paragraphs: [
        "Quando commenti conserviamo il nome che hai scritto, il testo, la lingua, l'orario e la storia a cui appartiene. Un commento approvato è pubblico, con quel nome. Se non hai effettuato l'accesso, impostiamo un cookie (atlasnews_comment_guest, valido un anno) che contiene un identificativo casuale e firmato, per permetterti di modificare o eliminare il tuo commento per un tempo limitato e per limitare gli abusi. Se hai effettuato l'accesso, colleghiamo invece il commento al tuo identificativo di account.",
        "Se chiedi di ricevere email su risposte e moderazione, conserviamo il tuo indirizzo solo per questo scopo, dopo che lo hai confermato, e inviamo quelle email tramite il nostro fornitore di posta. Se segnali un commento, conserviamo il motivo, i dettagli che aggiungi e chi ha segnalato.",
      ],
    },
    {
      id: "newsletter",
      heading: "Newsletter",
      paragraphs: [
        "Per inviare il briefing conserviamo il tuo indirizzo email, la lingua, dove ti sei iscritto e quando hai dato il consenso. Prima ti inviamo un link di conferma e ti iscriviamo solo dopo che lo hai aperto. Ogni briefing contiene un link per annullare l'iscrizione. Dopo la disiscrizione conserviamo l'indirizzo contrassegnato come disiscritto e, se un messaggio è rimbalzato o è stato segnalato come spam, un hash a senso unico dell'indirizzo, per non scriverti più.",
        "Le email partono tramite Resend, che riceve l'indirizzo, il messaggio e gli eventi di consegna (consegnato, rimbalzato, aperto, cliccato).",
      ],
    },
    {
      id: "contact",
      heading: "I messaggi che ci invii",
      paragraphs: [
        "Il modulo di contatto conserva nome, indirizzo email, oggetto, messaggio, lingua della pagina e orario. I nostri redattori lo leggono nello Studio e con i loro strumenti, per risponderti e migliorare il sito. Eliminiamo i messaggi quando non servono più.",
        "Per fermare gli abusi contiamo i messaggi per rete. Il contatore contiene un hash a senso unico del tuo indirizzo di rete, non l'indirizzo né il messaggio, e viene eliminato dopo un giorno senza messaggi.",
      ],
    },
    {
      id: "sign-in",
      heading: "Accesso",
      paragraphs: [
        "I redattori, e i lettori dove l'accesso è offerto, accedono con ChatGPT, Google o GitHub dove il sito li offre, oppure con email e password in un'installazione propria. Il fornitore che scegli comunica al sito il tuo identificativo di account, un indirizzo email verificato e il nome (GitHub: l'email principale verificata). Li usiamo per riconoscerti, attribuire storie e commenti e dare ai redattori il loro accesso. Non riceviamo le tue conversazioni su ChatGPT.",
      ],
    },
    {
      id: "cookies",
      heading: "Cookie e memoria locale",
      items: [
        "atlasnews_comment_guest: solo dopo che pubblichi un commento senza accedere; un anno; identifica i tuoi commenti.",
        "Sessione di accesso: impostata dal sito o dal fornitore di accesso solo se accedi; serve a mantenerti connesso. Un cookie di breve durata protegge anche il passaggio di accesso con Google o GitHub.",
        "Storie salvate: memoria locale del browser, non lascia mai il tuo dispositivo.",
        "Non impostiamo cookie pubblicitari, di analisi o di tracciamento.",
      ],
    },
    {
      id: "basis",
      heading: "Perché possiamo trattarli",
      items: [
        "Il tuo consenso: la newsletter, le email sui tuoi commenti e il cookie dei commenti dove la legge lo richiede. Puoi revocarlo in qualsiasi momento.",
        "Il nostro legittimo interesse a gestire una pubblicazione sicura: log del server, limiti agli abusi, moderazione e risposta ai tuoi messaggi.",
        "L'esecuzione di ciò che chiedi, come rispondere al tuo messaggio o pubblicare il tuo commento.",
        "Gli obblighi di legge, dove si applicano.",
      ],
    },
    {
      id: "recipients",
      heading: "Chi altro gestisce i tuoi dati",
      items: [
        "Il fornitore di hosting che gestisce il sito, il suo database e l'archiviazione dei file.",
        "Resend, per inviare le email di conferma, di newsletter e di notifica.",
        "OpenAI, Google o GitHub, se accedi con loro, oppure il fornitore di autenticazione di un'installazione propria.",
      ],
      paragraphs: [
        "Questi fornitori agiscono per nostro conto secondo i propri termini. I dati possono essere trattati fuori dal tuo paese, con le garanzie richieste dalla legge. Non vendiamo i tuoi dati.",
      ],
    },
    {
      id: "keeping",
      heading: "Per quanto tempo li conserviamo",
      paragraphs: [
        "I commenti restano finché tu o un moderatore non li eliminate. I dati della newsletter restano finché sei iscritto, poi solo il contrassegno di disiscrizione o l'hash descritto sopra. I messaggi restano finché non abbiamo risposto e non ci servono più. I log del server sono conservati dal fornitore di hosting per un periodo breve.",
      ],
    },
    {
      id: "rights",
      heading: "I tuoi diritti",
      paragraphs: [
        "Puoi chiederci di accedere ai tuoi dati, correggerli, eliminarli, limitarne o fermarne l'uso, o riceverli in forma portabile, e puoi revocare il consenso in qualsiasi momento. Scrivici con il modulo nella pagina Assistenza dall'indirizzo interessato. Puoi anche presentare reclamo all'autorità per la protezione dei dati; in Italia è il Garante per la protezione dei dati personali.",
      ],
    },
    {
      id: "changes",
      heading: "Modifiche",
      paragraphs: [
        "Quando cambia ciò che trattiamo, aggiorniamo questa pagina e la sua data.",
      ],
    },
  ],
};

const termsEn: LegalCopy = {
  title: "Terms of service",
  description: "The rules for using AtlasNews: reading, commenting, the newsletter, the contact form, automated access and the agent plugin.",
  updatedLabel: "Last updated",
  updated: "2026-10-11",
  intro: "By using AtlasNews you accept these terms. If you do not, please do not use the site.",
  sections: [
    {
      id: "use",
      heading: "Using the site",
      paragraphs: [
        "AtlasNews publishes news and analysis about artificial intelligence for information. It is not professional, legal or financial advice. Each story shows its sources and how settled its claim is; check them before you rely on a story.",
      ],
    },
    {
      id: "comments",
      heading: "Comments",
      paragraphs: [
        "You are responsible for what you post. Do not post anything unlawful, abusive, hateful, deceptive, spam or that invades someone's privacy. Comments are checked before they appear, and we may reject, hide or delete any comment. By posting you let us display your comment, with the name you chose, on the site. You can edit or delete your own comment for a limited time.",
      ],
    },
    {
      id: "newsletter",
      heading: "Newsletter and messages",
      paragraphs: [
        "The newsletter is sent only to addresses that confirmed their subscription, and you can unsubscribe at any time with the link in every email. Use the contact form for real questions and requests; we do not promise a reply to every message, and we may ignore messages that are abusive or spam.",
      ],
    },
    {
      id: "content",
      heading: "Our content",
      paragraphs: [
        "Unless stated otherwise, the stories, images and design of AtlasNews belong to AtlasNews or its authors. You may quote short excerpts with a clear link to the story. Anything more needs our permission.",
      ],
    },
    {
      id: "automated",
      heading: "Automated access and AI assistants",
      paragraphs: [
        "Published stories, the feeds and the public parts of the agent plugin may be read by software and AI assistants as long as they respect robots.txt and do not overload the site. The editor tools of the plugin and the Studio are only for people we invited and they act for those people. Do not try to bypass sign-in, limits or other protections.",
      ],
    },
    {
      id: "availability",
      heading: "Availability and liability",
      paragraphs: [
        "We try to keep AtlasNews available and accurate, but it is provided as it is, without guarantees. To the extent the law allows, we are not liable for losses that result from using or being unable to use the site. Nothing here limits any liability that cannot be limited by law, or the rights you have as a consumer.",
      ],
    },
    {
      id: "law",
      heading: "Changes and governing law",
      paragraphs: [
        "We may update these terms and will change the date above when we do; using the site afterwards means you accept the update. These terms are governed by the law of the country where the publisher is established, without affecting the mandatory consumer protections of the country where you live.",
      ],
    },
    {
      id: "contact",
      heading: "Contact",
      paragraphs: [
        "Questions about these terms: use the form on the Support page.",
      ],
    },
  ],
};

const termsIt: LegalCopy = {
  title: "Termini di servizio",
  description: "Le regole per usare AtlasNews: lettura, commenti, newsletter, modulo di contatto, accesso automatico e plugin per agenti.",
  updatedLabel: "Ultimo aggiornamento",
  updated: "2026-10-11",
  intro: "Usando AtlasNews accetti questi termini. Se non li accetti, ti chiediamo di non usare il sito.",
  sections: [
    {
      id: "use",
      heading: "Uso del sito",
      paragraphs: [
        "AtlasNews pubblica notizie e analisi sull'intelligenza artificiale a scopo informativo. Non costituisce consulenza professionale, legale o finanziaria. Ogni storia mostra le fonti e quanto è solida l'affermazione: verificale prima di fare affidamento su una storia.",
      ],
    },
    {
      id: "comments",
      heading: "Commenti",
      paragraphs: [
        "Sei responsabile di ciò che pubblichi. Non pubblicare nulla di illecito, offensivo, d'odio, ingannevole, spam o che violi la privacy di qualcuno. I commenti sono controllati prima della pubblicazione e possiamo rifiutare, nascondere o eliminare qualsiasi commento. Pubblicando ci autorizzi a mostrare il tuo commento, con il nome che hai scelto, sul sito. Puoi modificare o eliminare il tuo commento per un tempo limitato.",
      ],
    },
    {
      id: "newsletter",
      heading: "Newsletter e messaggi",
      paragraphs: [
        "La newsletter è inviata solo agli indirizzi che hanno confermato l'iscrizione e puoi disiscriverti in qualsiasi momento con il link presente in ogni email. Usa il modulo di contatto per domande e richieste reali; non promettiamo una risposta a ogni messaggio e possiamo ignorare i messaggi offensivi o di spam.",
      ],
    },
    {
      id: "content",
      heading: "I nostri contenuti",
      paragraphs: [
        "Salvo diversa indicazione, le storie, le immagini e la grafica di AtlasNews appartengono ad AtlasNews o ai suoi autori. Puoi citare brevi estratti con un link chiaro alla storia. Per altro serve il nostro permesso.",
      ],
    },
    {
      id: "automated",
      heading: "Accesso automatico e assistenti AI",
      paragraphs: [
        "Le storie pubblicate, i feed e le parti pubbliche del plugin per agenti possono essere lette da software e assistenti AI purché rispettino robots.txt e non sovraccarichino il sito. Gli strumenti da redattore del plugin e lo Studio sono riservati alle persone che abbiamo invitato e agiscono per loro conto. Non tentare di aggirare accesso, limiti o altre protezioni.",
      ],
    },
    {
      id: "availability",
      heading: "Disponibilità e responsabilità",
      paragraphs: [
        "Cerchiamo di mantenere AtlasNews disponibile e accurato, ma è fornito così com'è, senza garanzie. Nei limiti consentiti dalla legge non rispondiamo delle perdite derivanti dall'uso o dall'impossibilità di usare il sito. Nulla qui limita una responsabilità che non può essere limitata per legge, né i diritti che hai come consumatore.",
      ],
    },
    {
      id: "law",
      heading: "Modifiche e legge applicabile",
      paragraphs: [
        "Possiamo aggiornare questi termini e, quando lo facciamo, cambiamo la data qui sopra; continuare a usare il sito dopo l'aggiornamento significa accettarlo. Questi termini sono regolati dalla legge del paese in cui l'editore è stabilito, fermi restando i diritti inderogabili del consumatore del paese in cui vivi.",
      ],
    },
    {
      id: "contact",
      heading: "Contatti",
      paragraphs: [
        "Domande su questi termini: usa il modulo nella pagina Assistenza.",
      ],
    },
  ],
};

export const privacyCopy: Record<Locale, LegalCopy> = { en: privacyEn, it: privacyIt };
export const termsCopy: Record<Locale, LegalCopy> = { en: termsEn, it: termsIt };
