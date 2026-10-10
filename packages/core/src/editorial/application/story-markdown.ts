import type { Article, ClaimStatus } from "../domain/article";
import type { EntityKind } from "../domain/entity";

/** The localized words of a story, taken from the locale's messages. */
export interface StoryMarkdownLabels {
  claimStatus: Record<ClaimStatus, string>;
  entityKind: Record<EntityKind, string>;
  keyPoints: string;
  sources: string;
}

/** Collapses whitespace so that a stored value cannot break the Markdown line it sits in. */
function inline(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

function escapeLinkLabel(value: string) {
  return inline(value).replace(/[[\]\\]/gu, "\\$&");
}

function escapeLinkDestination(value: string) {
  return value.replace(/[()]/gu, (char) => (char === "(" ? "%28" : "%29"));
}

/**
 * The published story as Markdown for agents and readers: title, metadata, excerpt, key
 * points, body and sources. The body is already Markdown and is passed through unchanged.
 */
export function renderStoryMarkdown(
  article: Article,
  url: string,
  labels: StoryMarkdownLabels,
): string {
  const entities = article.entities.map((entity) => {
    const role = entity.isPrimary ? ", primary" : "";
    return `${inline(entity.name)} (${labels.entityKind[entity.kind]}${role})`;
  });
  const metadata = [
    `- URL: ${url}`,
    article.publishedAt ? `- Published: ${article.publishedAt}` : null,
    `- Updated: ${article.updatedAt}`,
    `- Language: ${article.locale}`,
    `- Status: ${labels.claimStatus[article.claimStatus]}`,
    entities.length ? `- Entities: ${entities.join("; ")}` : null,
    `- Author: ${inline(article.author.name)}`,
  ].filter((line): line is string => line !== null);
  const keyPoints = article.keyPoints.map((point) => `- ${inline(point)}`);
  const sources = article.sources.map((source) => [
    `- [${escapeLinkLabel(source.title)}](${escapeLinkDestination(source.url)}):`,
    inline(source.supports),
  ].join(" "));

  const blocks = [
    `# ${inline(article.title)}`,
    metadata.join("\n"),
    inline(article.excerpt),
    keyPoints.length ? `## ${labels.keyPoints}\n\n${keyPoints.join("\n")}` : "",
    article.content.trim(),
    sources.length ? `## ${labels.sources}\n\n${sources.join("\n")}` : "",
  ];
  return `${blocks.filter(Boolean).join("\n\n")}\n`;
}
