import Image from "next/image";
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
} from "react-markdown";
import remarkGfm from "remark-gfm";
import { isAllowedEditorialImageSource } from "@atlasnews/core/editorial/domain/editorial-image";
import { markdownHeadingIdsPlugin } from "@/lib/markdown";
import { markdownCalloutsPlugin } from "./callouts";
import { EmbedFrame } from "./embed-frame";
import { markdownEmbedsPlugin } from "./embeds";
import { rehypeHighlightFences } from "./highlight";
import { defaultMarkdownLabels, type MarkdownLabels } from "./labels";

type MarkdownRendererProps = {
  className?: string;
  content: string;
  imageUnavailableLabel?: string;
  /** Callout titles and embed copy in the article locale; English when omitted. */
  labels?: MarkdownLabels;
};

const externalUrlPattern = /^(?:https?:)?\/\//i;

function joinClassNames(...values: Array<string | undefined>) {
  return [...new Set(values.flatMap((value) => value?.split(/\s+/).filter(Boolean) ?? []))].join(" ");
}

export function MarkdownRenderer({
  className,
  content,
  imageUnavailableLabel = "Image unavailable",
  labels = defaultMarkdownLabels,
}: MarkdownRendererProps) {
  const components: Components = {
    a({ node, href, children, ...props }) {
      void node;
      const isExternal = typeof href === "string" && externalUrlPattern.test(href);
      return (
        <a
          {...props}
          href={href}
          rel={isExternal ? "noopener noreferrer" : undefined}
          target={isExternal ? "_blank" : undefined}
        >
          {children}
        </a>
      );
    },
    img({ node, src, alt, title }) {
      void node;
      const source = typeof src === "string" ? src : "";
      const accessibleLabel = alt?.trim() || imageUnavailableLabel;

      if (!source || !isAllowedEditorialImageSource(source)) {
        return (
          <span
            aria-label={accessibleLabel}
            className="markdown-image-unavailable"
            data-markdown-image-unavailable="true"
            role="img"
          >
            {accessibleLabel}
          </span>
        );
      }

      return (
        <Image
          alt={alt ?? ""}
          className="markdown-image"
          height={900}
          sizes="(max-width: 48rem) 100vw, 45rem"
          src={source}
          title={title}
          width={1600}
        />
      );
    },
    table({ node, children, ...props }) {
      void node;
      return (
        <div className="markdown-table-scroll">
          <table {...props}>{children}</table>
        </div>
      );
    },
  };
  // `markdown-embed` is the element markdownEmbedsPlugin emits; it is not an HTML tag, so Components omits it.
  const embedComponents = {
    ...components,
    "markdown-embed"({ href }: { href?: string }) {
      return href ? <EmbedFrame href={href} labels={labels.embeds} /> : null;
    },
  } as Components;

  return (
    <div className={joinClassNames("markdown-content", className)}>
      <ReactMarkdown
        components={embedComponents}
        rehypePlugins={[rehypeHighlightFences]}
        remarkPlugins={[remarkGfm, markdownHeadingIdsPlugin, [markdownCalloutsPlugin, labels], markdownEmbedsPlugin]}
        skipHtml
        urlTransform={defaultUrlTransform}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
