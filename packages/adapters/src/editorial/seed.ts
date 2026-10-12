import {
  defaultCoverImage,
  type Article,
  type ArticleStatus,
  type Author,
  type Category,
  type ClaimStatus,
  type SocialChannel,
  type SourceNote,
} from "@atlasnews/core/editorial/domain/article";
import type { Entity } from "@atlasnews/core/editorial/domain/entity";
import { locales, type Locale } from "@atlasnews/core/locale";

interface LocalizedCategorySeed {
  slug: string;
  name: string;
  description: string;
}

const categoryTranslations: Record<
  string,
  Record<Locale, LocalizedCategorySeed>
> = {
  research: {
    en: {
      slug: "research",
      name: "Research",
      description: "Models, papers, and technical frontiers.",
    },
    it: {
      slug: "ricerca",
      name: "Ricerca",
      description: "Modelli, paper e frontiere tecniche.",
    },
  },
  business: {
    en: {
      slug: "business",
      name: "Business",
      description: "Products, markets, and the future of work.",
    },
    it: {
      slug: "aziende",
      name: "Economia",
      description: "Prodotti, mercato e lavoro.",
    },
  },
  policy: {
    en: {
      slug: "policy",
      name: "Policy",
      description: "Rules, rights, and governance.",
    },
    it: {
      slug: "policy",
      name: "Normativa",
      description: "Regole, diritti e governance.",
    },
  },
  tools: {
    en: {
      slug: "tools",
      name: "Tools",
      description: "Tested tools and practical workflows.",
    },
    it: {
      slug: "strumenti",
      name: "Strumenti",
      description: "Tool e workflow verificati.",
    },
  },
  society: {
    en: {
      slug: "society",
      name: "Ethics & society",
      description: "Impact, culture, and people.",
    },
    it: {
      slug: "societa",
      name: "Etica e società",
      description: "Impatto, cultura e persone.",
    },
  },
};

export const seedCategories: Category[] = Object.entries(categoryTranslations).flatMap(
  ([translationKey, translations]) =>
    locales.map((locale) => ({
      id: `cat-${translationKey}-${locale}`,
      translationKey,
      locale,
      ...translations[locale],
    })),
);

export const seedAuthor: Author = {
  id: "author-elena-riva",
  name: "Elena Riva",
  role: "Editor",
  initials: "ER",
};

interface LocalizedArticleSeed {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: keyof typeof categoryTranslations;
  coverAlt: string;
}

interface ArticleSeed {
  translationKey: string;
  status: ArticleStatus;
  featured: boolean;
  readingMinutes: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  distribution: SocialChannel[];
  translations: Record<Locale, LocalizedArticleSeed>;
}

/**
 * Real companies and the assistants they publish, with their official pages. The
 * descriptions state only what each name is; no release, model or date is claimed.
 */
export interface SeedEntity extends Omit<Entity, "id" | "parent"> {
  id: string;
  parent: string | null;
  description: Record<Locale, string>;
}

export const seedEntities: SeedEntity[] = [
  { id: "ed1c7e10-0000-4000-8000-000000000001", kind: "company", slug: "anthropic", name: "Anthropic", officialUrl: "https://www.anthropic.com", parent: null,
    description: { en: "AI company that develops the Claude assistant.", it: "Azienda di AI che sviluppa l’assistente Claude." } },
  { id: "ed1c7e10-0000-4000-8000-000000000002", kind: "company", slug: "openai", name: "OpenAI", officialUrl: "https://openai.com", parent: null,
    description: { en: "AI company that develops the ChatGPT assistant.", it: "Azienda di AI che sviluppa l’assistente ChatGPT." } },
  { id: "ed1c7e10-0000-4000-8000-000000000003", kind: "company", slug: "google", name: "Google", officialUrl: "https://ai.google", parent: null,
    description: { en: "Technology company whose AI assistant is Gemini.", it: "Azienda tecnologica il cui assistente AI è Gemini." } },
  { id: "ed1c7e10-0000-4000-8000-000000000004", kind: "company", slug: "microsoft", name: "Microsoft", officialUrl: "https://www.microsoft.com", parent: null,
    description: { en: "Technology company whose AI assistant is Copilot.", it: "Azienda tecnologica il cui assistente AI è Copilot." } },
  { id: "ed1c7e10-0000-4000-8000-000000000005", kind: "company", slug: "mistral-ai", name: "Mistral AI", officialUrl: "https://mistral.ai", parent: null,
    description: { en: "French AI company that develops the Le Chat assistant.", it: "Azienda francese di AI che sviluppa l’assistente Le Chat." } },
  { id: "ed1c7e10-0000-4000-8000-000000000011", kind: "product", slug: "claude", name: "Claude", officialUrl: "https://claude.ai", parent: "anthropic",
    description: { en: "The AI assistant from Anthropic.", it: "L’assistente AI di Anthropic." } },
  { id: "ed1c7e10-0000-4000-8000-000000000012", kind: "product", slug: "chatgpt", name: "ChatGPT", officialUrl: "https://chatgpt.com", parent: "openai",
    description: { en: "The AI assistant from OpenAI.", it: "L’assistente AI di OpenAI." } },
  { id: "ed1c7e10-0000-4000-8000-000000000013", kind: "product", slug: "gemini", name: "Gemini", officialUrl: "https://gemini.google.com", parent: "google",
    description: { en: "The AI assistant from Google.", it: "L’assistente AI di Google." } },
  { id: "ed1c7e10-0000-4000-8000-000000000014", kind: "product", slug: "copilot", name: "Copilot", officialUrl: "https://copilot.microsoft.com", parent: "microsoft",
    description: { en: "The AI assistant from Microsoft.", it: "L’assistente AI di Microsoft." } },
  { id: "ed1c7e10-0000-4000-8000-000000000015", kind: "product", slug: "le-chat", name: "Le Chat", officialUrl: "https://chat.mistral.ai", parent: "mistral-ai",
    description: { en: "The AI assistant from Mistral AI.", it: "L’assistente AI di Mistral AI." } },
];

/**
 * What each demo story says about itself. The demo texts are general analysis and name no
 * company, so none links an entity. Key points restate the text; the only source is the
 * official text of the regulation that "AI Act: what changes for businesses" is about.
 */
const storyNotes: Record<
  string,
  { claimStatus: ClaimStatus; keyPoints: Record<Locale, string[]>; sources?: Record<Locale, SourceNote[]> }
> = {
  "agents-at-work": {
    claimStatus: "analysis",
    keyPoints: {
      en: [
        "Agents are leaving the sandbox for operational workflows.",
        "Value appears when an agent shows sources, keeps a trail and asks approval.",
        "Failures come from incomplete context, excessive permissions and ambiguous goals.",
      ],
      it: [
        "Gli agenti escono dai sandbox ed entrano nei flussi operativi.",
        "Il valore emerge quando l’agente mostra le fonti, lascia una traccia e chiede conferma.",
        "Gli errori nascono da contesto incompleto, permessi troppo ampi e obiettivi ambigui.",
      ],
    },
  },
  "open-model-efficiency": {
    claimStatus: "analysis",
    keyPoints: {
      en: [
        "Quality no longer improves through size alone.",
        "Measure latency, accuracy on your domain and cost per successful outcome.",
      ],
      it: [
        "La qualità non cresce più soltanto con la dimensione.",
        "Misura latenza, accuratezza sul tuo dominio e costo per risultato.",
      ],
    },
  },
  "europe-ai-rules": {
    claimStatus: "analysis",
    keyPoints: {
      en: [
        "Compliance is becoming product work.",
        "Organizations need an inventory of systems, clear ownership and checkable evidence.",
      ],
      it: [
        "La conformità sta diventando lavoro di prodotto.",
        "Servono un inventario dei sistemi, responsabilità chiare e prove verificabili.",
      ],
    },
  },
  "five-ai-tools": {
    claimStatus: "analysis",
    keyPoints: {
      en: [
        "Five tools tested on concrete tasks, with limits and costs stated.",
        "Check export, permissions, deletion and traceability before adopting one.",
      ],
      it: [
        "Cinque strumenti provati su attività concrete, con limiti e costi dichiarati.",
        "Controlla esportazione, permessi, cancellazione e tracciabilità prima di adottarne uno.",
      ],
    },
  },
  "measuring-ai-roi": {
    claimStatus: "analysis",
    keyPoints: {
      en: [
        "Useful return combines quality, speed, avoided risk and released capacity.",
        "Measure the current process before introducing a model.",
      ],
      it: [
        "Il ritorno utile combina qualità, velocità, rischio evitato e capacità liberata.",
        "Misura il processo attuale prima di introdurre un modello.",
      ],
    },
  },
  "long-context-memory": {
    claimStatus: "analysis",
    keyPoints: {
      en: [
        "Window length, retrieval and attention are different problems.",
        "Huge contexts can increase latency and noise.",
      ],
      it: [
        "Lunghezza, recupero e attenzione sono problemi diversi.",
        "Un contesto enorme può aumentare latenza e rumore.",
      ],
    },
  },
  "ai-act-business": {
    claimStatus: "analysis",
    keyPoints: {
      en: [
        "Knowing where AI is used is the first control.",
        "Controls should follow risk, not every automation needs the same documentation.",
      ],
      it: [
        "Sapere dove l’AI viene usata è il primo controllo.",
        "I controlli seguono il rischio: non ogni automazione richiede la stessa documentazione.",
      ],
    },
    sources: {
      en: [{
        title: "Regulation (EU) 2024/1689 (AI Act), official text",
        url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
        supports: "The obligations the AI Act places on businesses.",
      }],
      it: [{
        title: "Regolamento (UE) 2024/1689 (AI Act), testo ufficiale",
        url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
        supports: "Gli obblighi che l’AI Act pone alle imprese.",
      }],
    },
  },
  "practical-agent-guide": {
    claimStatus: "analysis",
    keyPoints: {
      en: [
        "Goals, approved sources, permissions and stopping conditions come before the prompt.",
        "Prove the complete workflow with a rollback plan before expanding access.",
      ],
      it: [
        "Obiettivo, fonti approvate, permessi e condizioni di arresto vengono prima del prompt.",
        "Prova il flusso completo con un piano di ripristino prima di ampliare gli accessi.",
      ],
    },
  },
};

const hero = defaultCoverImage;

const stories: ArticleSeed[] = [
  {
    translationKey: "agents-at-work",
    status: "published",
    featured: true,
    readingMinutes: 8,
    publishedAt: "2026-08-08T12:34:00.000Z",
    createdAt: "2026-08-06T08:00:00.000Z",
    updatedAt: "2026-08-08T12:34:00.000Z",
    distribution: ["newsletter", "linkedin", "x", "whatsapp"],
    translations: {
      en: {
        slug: "ai-agents-enter-everyday-work",
        title: "AI agents are entering everyday work",
        excerpt:
          "From prototypes to real processes: what works, where agents fail, and what to watch next.",
        content: `## From prototype to process

After two years of experiments, AI agents are leaving the sandbox and joining operational workflows. The shift is not only technical: it requires sound processes, reliable data, governance, and new skills.

Organizations seeing concrete results begin with narrow, measurable problems, short learning cycles, and meaningful human oversight for consequential decisions.

## Where agents create value

The strongest cases combine internal research, document preparation, and the orchestration of repetitive work. Value appears when an agent can show its sources, preserve an audit trail, and request approval before high-impact steps.

> Technology alone does not determine the outcome. The quality of the surrounding process does.

## Where they still fail

Incomplete context, excessive permissions, and ambiguous goals remain the main sources of failure. A trustworthy agent must fail visibly, within a limited scope, and in a reversible way.

## What to watch next

The next phase will be less spectacular and more useful: vertical tools, continuous evaluation, and integration with systems people already use.`,
        category: "research",
        coverAlt: "Black abstract sculpture crossed by a coral glow",
      },
      it: {
        slug: "gli-agenti-ai-entrano-nel-lavoro-quotidiano",
        title: "Gli agenti AI entrano nel lavoro quotidiano",
        excerpt:
          "Dai prototipi ai processi reali: cosa sta funzionando, dove fallisce e cosa osservare adesso.",
        content: `## Dal prototipo al processo

Dopo due anni di sperimentazioni, gli agenti AI stanno uscendo dai sandbox per entrare nei flussi operativi. Il passaggio non è solo tecnologico: richiede processo, dati affidabili, governance e nuove competenze.

Le organizzazioni che ottengono risultati concreti iniziano da problemi ben definiti, misurabili, con cicli brevi di apprendimento e un forte presidio umano nelle decisioni critiche.

## Dove gli agenti creano valore

I casi più solidi combinano ricerca interna, preparazione di documenti e orchestrazione di attività ripetitive. Il valore emerge quando l’agente può mostrare fonti, lasciare una traccia e chiedere conferma nei passaggi ad alto impatto.

> Non è la tecnologia a determinare l’impatto, ma la qualità del processo in cui viene inserita.

## Dove ancora falliscono

Contesto incompleto, permessi troppo ampi e obiettivi ambigui restano le cause principali degli errori. Un agente affidabile deve poter fallire in modo visibile, limitato e reversibile.

## Cosa osservare adesso

La prossima fase sarà meno spettacolare e più utile: strumenti verticali, valutazioni continue e integrazione nei sistemi che le persone usano già.`,
        category: "research",
        coverAlt: "Scultura astratta nera attraversata da luce corallo",
      },
    },
  },
  {
    translationKey: "open-model-efficiency",
    status: "published",
    featured: false,
    readingMinutes: 5,
    publishedAt: "2026-08-08T10:34:00.000Z",
    createdAt: "2026-08-07T08:00:00.000Z",
    updatedAt: "2026-08-08T10:34:00.000Z",
    distribution: ["newsletter", "linkedin"],
    translations: {
      en: {
        slug: "open-models-new-race-for-efficiency",
        title: "Open models and the new race for efficiency",
        excerpt:
          "Fewer parameters, faster inference, and tighter cost control are changing the terms of competition.",
        content: `## Efficiency before scale

Quality no longer improves through size alone. Distillation, routing, and better data are reshaping the relationship between performance and cost.

## What to measure

Latency, accuracy on your own domain, and cost per successful outcome matter more than a general leaderboard.`,
        category: "research",
        coverAlt: "Abstract black structure with a coral core",
      },
      it: {
        slug: "modelli-aperti-nuova-corsa-efficienza",
        title: "Modelli aperti: la nuova corsa all’efficienza",
        excerpt:
          "Meno parametri, inferenza più rapida e controllo dei costi: la competizione cambia terreno.",
        content: `## Efficienza prima della scala

La qualità non cresce più soltanto con la dimensione. Distillazione, routing e dati migliori stanno ridisegnando il rapporto tra prestazioni e costo.

## Cosa misurare

Latenza, accuratezza sul proprio dominio e costo per risultato contano più di una classifica generale.`,
        category: "research",
        coverAlt: "Struttura astratta nera con un nucleo corallo",
      },
    },
  },
  {
    translationKey: "europe-ai-rules",
    status: "published",
    featured: false,
    readingMinutes: 6,
    publishedAt: "2026-08-08T09:07:00.000Z",
    createdAt: "2026-08-07T07:00:00.000Z",
    updatedAt: "2026-08-08T09:07:00.000Z",
    distribution: ["newsletter", "linkedin", "x"],
    translations: {
      en: {
        slug: "europe-rewrites-the-rules-for-ai",
        title: "Europe is rewriting the rules for AI",
        excerpt:
          "Obligations, deadlines, and operational impact explained without the legal jargon.",
        content: `## From rules to processes

Compliance is becoming product work: organizations need an inventory of systems, clear ownership, and evidence that can be independently checked.

## The useful threshold

The decisive question is not only which model is used, but which risk it creates in the real context of use.`,
        category: "policy",
        coverAlt: "Black abstract detail illuminated in coral",
      },
      it: {
        slug: "europa-riscrive-regole-ai",
        title: "L’Europa riscrive le regole per l’AI",
        excerpt: "Obblighi, scadenze e impatti operativi spiegati senza gergo.",
        content: `## Dalle regole ai processi

La conformità diventa un lavoro di prodotto: inventario dei sistemi, responsabilità chiare e prove verificabili.

## La soglia utile

La domanda decisiva non è solo quale modello viene usato, ma quale rischio produce nel contesto reale.`,
        category: "policy",
        coverAlt: "Dettaglio astratto nero illuminato in corallo",
      },
    },
  },
  {
    translationKey: "five-ai-tools",
    status: "published",
    featured: false,
    readingMinutes: 4,
    publishedAt: "2026-08-08T07:42:00.000Z",
    createdAt: "2026-08-07T09:00:00.000Z",
    updatedAt: "2026-08-08T07:42:00.000Z",
    distribution: ["newsletter", "whatsapp"],
    translations: {
      en: {
        slug: "five-ai-tools-to-try-this-week",
        title: "Five AI tools to try this week",
        excerpt:
          "A practical selection: what each tool does, who it helps, and where caution is required.",
        content: `## A tested selection

This is not an endless directory. These five tools were tested on concrete tasks, with their limits and costs stated clearly.

## Before adoption

Check data export, permissions, deletion controls, and the traceability of every result before connecting a tool to real work.`,
        category: "tools",
        coverAlt: "Black and coral abstract editorial form",
      },
      it: {
        slug: "cinque-strumenti-ai-settimana",
        title: "Cinque strumenti da provare questa settimana",
        excerpt:
          "Una selezione pratica: cosa fanno, per chi servono e dove prestare attenzione.",
        content: `## Una selezione verificata

Non una lista infinita: cinque strumenti provati su attività concrete, con limiti e costi dichiarati.

## Prima di adottare

Controlla esportazione dei dati, permessi, cancellazione e tracciabilità dei risultati prima di collegare uno strumento al lavoro reale.`,
        category: "tools",
        coverAlt: "Forma editoriale astratta nera e corallo",
      },
    },
  },
  {
    translationKey: "measuring-ai-roi",
    status: "published",
    featured: false,
    readingMinutes: 7,
    publishedAt: "2026-08-07T15:20:00.000Z",
    createdAt: "2026-08-06T09:00:00.000Z",
    updatedAt: "2026-08-07T15:20:00.000Z",
    distribution: ["newsletter", "linkedin"],
    translations: {
      en: {
        slug: "how-companies-measure-ai-roi",
        title: "How companies are measuring the ROI of AI",
        excerpt:
          "Methods, meaningful KPIs, and the practical limits of projects running in production.",
        content: `## Beyond hours saved

Useful return combines quality, speed, avoided risk, and capacity released for higher-value work.

## Establish a baseline first

Without measuring the current process before introducing a model, every claimed improvement remains a story rather than evidence.`,
        category: "business",
        coverAlt: "Dark material lit by a coral glow",
      },
      it: {
        slug: "come-aziende-misurano-roi-ai",
        title: "Come le aziende stanno misurando il ROI dell’AI",
        excerpt: "Metodologie, KPI e limiti reali dei progetti in produzione.",
        content: `## Oltre le ore risparmiate

Il ritorno utile combina qualità, velocità, rischio evitato e capacità liberata per attività di maggior valore.

## Baseline prima del modello

Senza misurare il processo attuale prima di introdurre un modello, ogni miglioramento resta una narrazione e non una prova.`,
        category: "business",
        coverAlt: "Materia scura illuminata da una luce corallo",
      },
    },
  },
  {
    translationKey: "long-context-memory",
    status: "published",
    featured: false,
    readingMinutes: 6,
    publishedAt: "2026-08-07T14:20:00.000Z",
    createdAt: "2026-08-06T11:00:00.000Z",
    updatedAt: "2026-08-07T14:20:00.000Z",
    distribution: ["newsletter", "x"],
    translations: {
      en: {
        slug: "long-context-memory-new-model-boundaries",
        title: "Long-context memory and the new boundaries of models",
        excerpt:
          "What million-token windows change, what they do not, and the trade-offs teams need to measure.",
        content: `## More context is not more memory

Window length, retrieval, and attention are different problems. Useful tests measure what a model can actually recover when the answer is buried in realistic material.

## The hidden cost

Huge contexts can increase latency and noise. Careful selection remains essential even when the technical limit expands.`,
        category: "research",
        coverAlt: "Dark neural ribbon with a coral core",
      },
      it: {
        slug: "memoria-lungo-contesto-confini-modelli",
        title: "Memoria a lungo contesto: i nuovi confini dei modelli",
        excerpt:
          "Cosa cambia con finestre da milioni di token e quali sono i trade-off da misurare.",
        content: `## Più contesto non significa più memoria

Lunghezza, recupero e attenzione sono problemi diversi. I test utili misurano ciò che il modello ritrova davvero quando la risposta è immersa in materiale realistico.

## Il costo nascosto

Un contesto enorme può aumentare latenza e rumore. La selezione resta decisiva anche quando il limite tecnico cresce.`,
        category: "research",
        coverAlt: "Nastro neurale scuro con un nucleo corallo",
      },
    },
  },
  {
    translationKey: "ai-act-business",
    status: "published",
    featured: false,
    readingMinutes: 5,
    publishedAt: "2026-08-07T08:15:00.000Z",
    createdAt: "2026-08-05T09:00:00.000Z",
    updatedAt: "2026-08-07T08:15:00.000Z",
    distribution: ["newsletter", "linkedin", "x"],
    translations: {
      en: {
        slug: "ai-act-what-changes-for-businesses",
        title: "AI Act: what changes for businesses",
        excerpt:
          "The essential obligations, deadlines, and operational impact in one concise guide.",
        content: `## Start with an inventory

Knowing where AI is used is the first control. Owners, data, and intended purposes must be visible and understandable.

## Proportionality matters

Controls should follow risk. Not every automation requires the same degree of documentation, oversight, or testing.`,
        category: "policy",
        coverAlt: "Dark surface crossed by coral light",
      },
      it: {
        slug: "ai-act-cosa-cambia-imprese",
        title: "AI Act: cosa cambia per le imprese",
        excerpt: "Obblighi, scadenze e impatti operativi essenziali in una guida sintetica.",
        content: `## Un inventario prima di tutto

Sapere dove l’AI viene usata è il primo controllo. Proprietari, dati e finalità devono essere visibili e comprensibili.

## Proporzionalità

I controlli seguono il rischio. Non ogni automazione richiede lo stesso livello di documentazione, presidio o test.`,
        category: "policy",
        coverAlt: "Superficie scura attraversata da luce corallo",
      },
    },
  },
  {
    translationKey: "practical-agent-guide",
    status: "draft",
    featured: false,
    readingMinutes: 3,
    publishedAt: null,
    createdAt: "2026-08-08T06:00:00.000Z",
    updatedAt: "2026-08-08T11:00:00.000Z",
    distribution: [],
    translations: {
      en: {
        slug: "from-prototype-to-process-practical-guide",
        title: "From prototype to process: a practical guide",
        excerpt:
          "An operational checklist for moving an AI agent into production with clear safeguards.",
        content: `## Define the boundary

Goals, approved sources, permissions, and stopping conditions come before the prompt. Name the owner and decide which actions always require confirmation.

## Prove the real workflow

Evaluate the complete path with representative data, visible failures, and a rollback plan before expanding access.`,
        category: "tools",
        coverAlt: "Abstract black form on a warm background",
      },
      it: {
        slug: "guida-pratica-agenti-ai",
        title: "Dai prototipi al processo: la guida pratica",
        excerpt:
          "Una checklist operativa per portare un agente in produzione con presidi chiari.",
        content: `## Definisci il confine

Obiettivo, fonti approvate, permessi e condizioni di arresto vengono prima del prompt. Indica il responsabile e stabilisci quali azioni richiedono sempre conferma.

## Prova il flusso reale

Valuta il percorso completo con dati rappresentativi, fallimenti visibili e un piano di ripristino prima di ampliare gli accessi.`,
        category: "tools",
        coverAlt: "Forma astratta nera su uno sfondo caldo",
      },
    },
  },
];

function category(translationKey: string, locale: Locale) {
  const value = seedCategories.find(
    (item) => item.translationKey === translationKey && item.locale === locale,
  );
  if (!value) {
    throw new Error(`Unknown seed category: ${translationKey}/${locale}`);
  }
  return value;
}

export const seedArticles: Article[] = stories.flatMap((story) =>
  locales.map((locale) => {
    const translation = story.translations[locale];
    return {
      id: `article-${story.translationKey}-${locale}`,
      translationKey: story.translationKey,
      locale,
      slug: translation.slug,
      title: translation.title,
      excerpt: translation.excerpt,
      content: translation.content,
      coverImage: hero,
      coverAlt: translation.coverAlt,
      status: story.status,
      category: category(translation.category, locale),
      author: seedAuthor,
      featured: story.featured,
      readingMinutes: story.readingMinutes,
      publishedAt: story.publishedAt,
      scheduledFor: null,
      createdAt: story.createdAt,
      updatedAt: story.updatedAt,
      distribution: [...story.distribution],
      claimStatus: storyNotes[story.translationKey].claimStatus,
      keyPoints: [...storyNotes[story.translationKey].keyPoints[locale]],
      sources: structuredClone(storyNotes[story.translationKey].sources?.[locale] ?? []),
      entities: [],
    };
  }),
);
