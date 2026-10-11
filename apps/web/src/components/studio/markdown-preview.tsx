import type { MarkdownLabels } from "@/components/markdown/labels";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";

export function MarkdownPreview({
  content,
  emptyLabel,
  imageUnavailableLabel,
  labels,
}: {
  content: string;
  emptyLabel: string;
  imageUnavailableLabel: string;
  labels?: MarkdownLabels;
}) {
  if (!content.trim()) {
    return <p className="studio-markdown__empty">{emptyLabel}</p>;
  }

  return (
    <MarkdownRenderer
      className="markdown-content studio-markdown__rendered"
      content={content}
      imageUnavailableLabel={imageUnavailableLabel}
      labels={labels}
    />
  );
}
