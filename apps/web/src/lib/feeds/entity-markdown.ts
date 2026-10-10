import type { EntityDetail, EntityTimelineItem } from "@atlasnews/core/editorial/domain/entity";
import { storyLabels } from "@atlasnews/core/editorial/application/story-labels";
import type { Locale } from "@/i18n";

function inline(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

export interface EntityMarkdownUrls {
  page: string;
  story: (slug: string) => string;
}

/** The entity as Markdown: identity, description and its published stories, oldest first. */
export function renderEntityMarkdown(
  entity: EntityDetail,
  timeline: EntityTimelineItem[],
  urls: EntityMarkdownUrls,
  locale: Locale,
) {
  const labels = storyLabels[locale];
  const metadata = [
    `- URL: ${urls.page}`,
    `- Kind: ${labels.entityKind[entity.kind]}`,
    entity.parent ? `- Parent: ${inline(entity.parent.name)}` : null,
    entity.officialUrl ? `- Official URL: ${entity.officialUrl}` : null,
    `- Stories: ${timeline.length}`,
  ].filter((line): line is string => line !== null);
  const timelineLines = timeline.map((item) => {
    const title = inline(item.title).replace(/[[\]\\]/gu, "\\$&");
    return `- ${item.publishedAt} · ${labels.claimStatus[item.claimStatus]} · [${title}](${urls.story(item.slug)})`;
  });

  const blocks = [
    `# ${inline(entity.name)}`,
    metadata.join("\n"),
    entity.description ? inline(entity.description) : "",
    timelineLines.length ? `## Timeline\n\n${timelineLines.join("\n")}` : "",
  ];
  return `${blocks.filter(Boolean).join("\n\n")}\n`;
}
