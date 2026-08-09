import Image from "next/image";
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
} from "react-markdown";
import remarkGfm from "remark-gfm";
import { isAllowedEditorialImageSource } from "@/lib/editorial-image";
import { markdownHeadingIdsPlugin } from "@/lib/markdown";

type MarkdownRendererProps = {
  className?: string;
  content: string;
  imageUnavailableLabel?: string;
};

const externalUrlPattern = /^(?:https?:)?\/\//i;

function joinClassNames(...values: Array<string | undefined>) {
  return [...new Set(values.flatMap((value) => value?.split(/\s+/).filter(Boolean) ?? []))].join(" ");
}

export function MarkdownRenderer({
  className,
  content,
  imageUnavailableLabel = "Image unavailable",
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

  return (
    <div className={joinClassNames("markdown-content", className)}>
      <ReactMarkdown
        components={components}
        remarkPlugins={[remarkGfm, markdownHeadingIdsPlugin]}
        skipHtml
        urlTransform={defaultUrlTransform}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
