export const calloutKinds = ["note", "tip", "important", "warning", "caution"] as const;
export type CalloutKind = (typeof calloutKinds)[number];

export type EmbedLabels = {
  /** Button text that loads the third-party player or post. */
  load: string;
  /** Link text for the original page. */
  open: string;
  /** Accessible title of the loaded frame. */
  title: string;
};

/** The words the renderer adds around content; callers pass the article locale's copy. */
export type MarkdownLabels = {
  callouts: Record<CalloutKind, string>;
  embeds: { x: EmbedLabels; youtube: EmbedLabels };
};

export const defaultMarkdownLabels: MarkdownLabels = {
  callouts: { note: "Note", tip: "Tip", important: "Important", warning: "Warning", caution: "Caution" },
  embeds: {
    youtube: { load: "Load video", open: "Watch on YouTube", title: "YouTube video" },
    x: { load: "Load post", open: "View on X", title: "Post on X" },
  },
};
