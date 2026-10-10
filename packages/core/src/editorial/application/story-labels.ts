import type { Locale } from "../../locale";
import type { StoryMarkdownLabels } from "./story-markdown";

/**
 * The human words of a story, per locale: claim statuses, entity kinds and the section titles.
 * The web messages, the Markdown export and the feeds all read them from here.
 */
export const storyLabels = {
  en: {
    claimStatus: { confirmed: "Confirmed", rollout: "Rolling out", test: "In test", rumour: "Rumour", analysis: "Analysis" },
    entityKind: { company: "Company", model: "Model", product: "Product" },
    keyPoints: "Key points",
    sources: "Sources",
  },
  it: {
    claimStatus: { confirmed: "Confermato", rollout: "In rilascio", test: "In test", rumour: "Rumor", analysis: "Analisi" },
    entityKind: { company: "Azienda", model: "Modello", product: "Prodotto" },
    keyPoints: "Punti chiave",
    sources: "Fonti",
  },
} as const satisfies Record<Locale, StoryMarkdownLabels>;
