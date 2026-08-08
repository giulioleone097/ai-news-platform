import type { Article, Author, Category } from "../domain/article";

export const seedCategories: Category[] = [
  { id: "cat-research", slug: "ricerca", name: "Ricerca", description: "Modelli, paper e frontiere tecniche." },
  { id: "cat-business", slug: "aziende", name: "Aziende", description: "Prodotti, mercato e lavoro." },
  { id: "cat-policy", slug: "policy", name: "Policy", description: "Regole, diritti e governance." },
  { id: "cat-tools", slug: "strumenti", name: "Strumenti", description: "Tool e workflow verificati." },
  { id: "cat-society", slug: "societa", name: "Etica e società", description: "Impatto, cultura e persone." },
];

export const seedAuthor: Author = {
  id: "author-elena-riva",
  name: "Elena Riva",
  role: "Editrice",
  initials: "ER",
};

const hero = "/media/neura-agents-hero.png";
const now = "2026-08-08T12:34:00.000Z";

function category(slug: string) {
  const value = seedCategories.find((item) => item.slug === slug);
  if (!value) throw new Error(`Unknown seed category: ${slug}`);
  return value;
}

export const seedArticles: Article[] = [
  {
    id: "article-agents-work",
    slug: "gli-agenti-ai-entrano-nel-lavoro-quotidiano",
    title: "Gli agenti AI entrano nel lavoro quotidiano",
    excerpt: "Dai prototipi ai processi reali: cosa sta funzionando, dove fallisce e cosa osservare adesso.",
    content: `## Dal prototipo al processo

Dopo due anni di sperimentazioni, gli agenti AI stanno uscendo dai sandbox per entrare nei flussi operativi. Il passaggio non è solo tecnologico: richiede processo, dati affidabili, governance e nuove competenze.

Le organizzazioni che ottengono risultati concreti iniziano da problemi ben definiti, misurabili, con cicli brevi di apprendimento e un forte presidio umano nelle decisioni critiche.

## Dove gli agenti creano valore

I casi più solidi combinano ricerca interna, preparazione di documenti e orchestrazione di attività ripetitive. Il valore emerge quando l’agente può mostrare fonti, lasciare una traccia e chiedere conferma nei passaggi ad alto impatto.

Non è la tecnologia a determinare l’impatto, ma la qualità del processo in cui viene inserita.

## Dove ancora falliscono

Contesto incompleto, permessi troppo ampi e obiettivi ambigui restano le cause principali degli errori. Un agente affidabile deve poter fallire in modo visibile, limitato e reversibile.

## Cosa osservare adesso

La prossima fase sarà meno spettacolare e più utile: strumenti verticali, valutazioni continue e integrazione nei sistemi che le persone usano già.`,
    coverImage: hero,
    coverAlt: "Scultura astratta nera attraversata da luce corallo",
    status: "published",
    category: category("ricerca"),
    author: seedAuthor,
    featured: true,
    readingMinutes: 8,
    publishedAt: now,
    scheduledFor: null,
    createdAt: "2026-08-06T08:00:00.000Z",
    updatedAt: now,
    distribution: ["newsletter", "linkedin", "x", "whatsapp"],
  },
  {
    id: "article-open-models",
    slug: "modelli-aperti-nuova-corsa-efficienza",
    title: "Modelli aperti: la nuova corsa all’efficienza",
    excerpt: "Meno parametri, inferenza più rapida e controllo dei costi: la competizione cambia terreno.",
    content: "## Efficienza prima della scala\n\nLa qualità non cresce più soltanto con la dimensione. Distillazione, routing e dati migliori stanno ridisegnando il rapporto tra prestazioni e costo.\n\n## Cosa misurare\n\nLatenza, accuratezza sul proprio dominio e costo per risultato contano più di una classifica generale.",
    coverImage: hero,
    coverAlt: "Struttura astratta nera e corallo",
    status: "published",
    category: category("ricerca"),
    author: seedAuthor,
    featured: false,
    readingMinutes: 5,
    publishedAt: "2026-08-08T10:34:00.000Z",
    scheduledFor: null,
    createdAt: "2026-08-07T08:00:00.000Z",
    updatedAt: "2026-08-08T10:34:00.000Z",
    distribution: ["newsletter", "linkedin"],
  },
  {
    id: "article-eu-rules",
    slug: "europa-riscrive-regole-ai",
    title: "L’Europa riscrive le regole per l’AI",
    excerpt: "Obblighi, scadenze e impatti operativi spiegati senza gergo.",
    content: "## Dalle regole ai processi\n\nLa conformità diventa un lavoro di prodotto: inventario dei sistemi, responsabilità chiare e prove verificabili.\n\n## La soglia utile\n\nLa domanda decisiva non è solo quale modello viene usato, ma quale rischio produce nel contesto reale.",
    coverImage: hero,
    coverAlt: "Dettaglio astratto nero con luce corallo",
    status: "published",
    category: category("policy"),
    author: seedAuthor,
    featured: false,
    readingMinutes: 6,
    publishedAt: "2026-08-08T09:07:00.000Z",
    scheduledFor: null,
    createdAt: "2026-08-07T07:00:00.000Z",
    updatedAt: "2026-08-08T09:07:00.000Z",
    distribution: ["newsletter", "linkedin", "x"],
  },
  {
    id: "article-five-tools",
    slug: "cinque-strumenti-ai-settimana",
    title: "Cinque strumenti da provare questa settimana",
    excerpt: "Una selezione pratica: cosa fanno, per chi servono e dove prestare attenzione.",
    content: "## Una selezione verificata\n\nNon una lista infinita: cinque strumenti provati su attività concrete, con limiti e costi dichiarati.\n\n## Prima di adottare\n\nControlla esportazione dei dati, permessi, cancellazione e tracciabilità dei risultati.",
    coverImage: hero,
    coverAlt: "Forma editoriale astratta nera e corallo",
    status: "published",
    category: category("strumenti"),
    author: seedAuthor,
    featured: false,
    readingMinutes: 4,
    publishedAt: "2026-08-08T07:42:00.000Z",
    scheduledFor: null,
    createdAt: "2026-08-07T09:00:00.000Z",
    updatedAt: "2026-08-08T07:42:00.000Z",
    distribution: ["newsletter", "whatsapp"],
  },
  {
    id: "article-roi",
    slug: "come-aziende-misurano-roi-ai",
    title: "Come le aziende stanno misurando il ROI dell’AI",
    excerpt: "Metodologie, KPI e limiti reali dei progetti in produzione.",
    content: "## Oltre le ore risparmiate\n\nIl ritorno utile combina qualità, velocità, rischio evitato e capacità liberata.\n\n## Baseline prima del modello\n\nSenza misurare il processo attuale, ogni miglioramento resta una narrazione.",
    coverImage: hero,
    coverAlt: "Materia nera illuminata da una luce corallo",
    status: "published",
    category: category("aziende"),
    author: seedAuthor,
    featured: false,
    readingMinutes: 7,
    publishedAt: "2026-08-07T15:20:00.000Z",
    scheduledFor: null,
    createdAt: "2026-08-06T09:00:00.000Z",
    updatedAt: "2026-08-07T15:20:00.000Z",
    distribution: ["newsletter", "linkedin"],
  },
  {
    id: "article-memory",
    slug: "memoria-lungo-contesto-confini-modelli",
    title: "Memoria a lungo contesto: i nuovi confini dei modelli",
    excerpt: "Cosa cambia con finestre da milioni di token e quali sono i trade-off.",
    content: "## Più contesto non significa più memoria\n\nLunghezza, recupero e attenzione sono problemi diversi. I test utili misurano ciò che il modello ritrova davvero.\n\n## Il costo nascosto\n\nContesto enorme può aumentare latenza e rumore: la selezione resta decisiva.",
    coverImage: hero,
    coverAlt: "Nastro neurale scuro con nucleo corallo",
    status: "published",
    category: category("ricerca"),
    author: seedAuthor,
    featured: false,
    readingMinutes: 6,
    publishedAt: "2026-08-07T14:20:00.000Z",
    scheduledFor: null,
    createdAt: "2026-08-06T11:00:00.000Z",
    updatedAt: "2026-08-07T14:20:00.000Z",
    distribution: ["newsletter", "x"],
  },
  {
    id: "article-ai-act",
    slug: "ai-act-cosa-cambia-imprese",
    title: "AI Act: cosa cambia per le imprese",
    excerpt: "Obblighi, scadenze e impatti operativi in sintesi.",
    content: "## Un inventario prima di tutto\n\nSapere dove l’AI viene usata è il primo controllo. Proprietari, dati e finalità devono essere leggibili.\n\n## Proporzionalità\n\nI controlli seguono il rischio: non ogni automazione richiede lo stesso livello di presidio.",
    coverImage: hero,
    coverAlt: "Superficie scura e luce corallo",
    status: "published",
    category: category("policy"),
    author: seedAuthor,
    featured: false,
    readingMinutes: 5,
    publishedAt: "2026-08-07T08:15:00.000Z",
    scheduledFor: null,
    createdAt: "2026-08-05T09:00:00.000Z",
    updatedAt: "2026-08-07T08:15:00.000Z",
    distribution: ["newsletter", "linkedin", "x"],
  },
  {
    id: "article-draft-guide",
    slug: "guida-pratica-agenti-ai",
    title: "Dai prototipi al processo: la guida pratica",
    excerpt: "Una checklist operativa per portare un agente in produzione.",
    content: "## Definisci il confine\n\nObiettivo, fonti, permessi e condizioni di arresto vengono prima del prompt.",
    coverImage: hero,
    coverAlt: "Forma nera astratta",
    status: "draft",
    category: category("strumenti"),
    author: seedAuthor,
    featured: false,
    readingMinutes: 3,
    publishedAt: null,
    scheduledFor: null,
    createdAt: "2026-08-08T06:00:00.000Z",
    updatedAt: "2026-08-08T11:00:00.000Z",
    distribution: [],
  },
];
