import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";

type MarkdownNode = {
  alt?: string;
  checked?: boolean | null;
  children?: MarkdownNode[];
  depth?: number;
  identifier?: string;
  lang?: string | null;
  ordered?: boolean;
  start?: number | null;
  title?: string | null;
  type: string;
  url?: string;
  value?: string;
};

type LinkDefinition = {
  title?: string | null;
  url: string;
};

type RenderContext = {
  definitions: ReadonlyMap<string, LinkDefinition>;
  tableHeader?: boolean;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function plainEmailText(value: string) {
  return value.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim();
}

function safeEmailUrl(value: string | undefined) {
  if (!value) return null;

  if (value.startsWith("#")) return value;

  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

function renderChildren(node: MarkdownNode, context: RenderContext) {
  return (node.children ?? []).map((child) => renderMarkdownNode(child, context)).join("");
}

function renderLink(url: string | undefined, title: string | null | undefined, label: string) {
  const safeUrl = safeEmailUrl(url);
  if (!safeUrl) return label;

  const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
  return `<a href="${escapeHtml(safeUrl)}"${titleAttribute} rel="noopener noreferrer" target="_blank" style="color:#b93d29;text-decoration:underline">${label}</a>`;
}

function renderMarkdownNode(node: MarkdownNode, context: RenderContext): string {
  const children = () => renderChildren(node, context);

  switch (node.type) {
    case "root":
      return children();
    case "text":
      return escapeHtml(node.value ?? "");
    case "paragraph":
      return `<p style="color:#303033;font-size:17px;line-height:1.65;margin:0 0 18px">${children()}</p>`;
    case "heading": {
      const depth = Math.min(6, Math.max(1, node.depth ?? 2));
      const styles = depth === 1
        ? "color:#151515;font-size:34px;line-height:1.08;margin:32px 0 16px"
        : depth === 2
          ? "color:#151515;font-size:28px;line-height:1.12;margin:32px 0 14px"
          : "color:#151515;font-size:22px;line-height:1.2;margin:28px 0 12px";
      return `<h${depth} style="${styles}">${children()}</h${depth}>`;
    }
    case "strong":
      return `<strong>${children()}</strong>`;
    case "emphasis":
      return `<em>${children()}</em>`;
    case "delete":
      return `<del>${children()}</del>`;
    case "blockquote":
      return `<blockquote style="border-left:3px solid #e45c42;color:#303033;font-size:18px;line-height:1.55;margin:24px 0;padding:4px 0 4px 18px">${children()}</blockquote>`;
    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      const start = node.ordered && node.start && node.start !== 1 ? ` start="${node.start}"` : "";
      return `<${tag}${start} style="color:#303033;font-size:17px;line-height:1.55;margin:0 0 20px;padding-left:24px">${children()}</${tag}>`;
    }
    case "listItem": {
      const checkbox = node.checked === true ? "☑ " : node.checked === false ? "☐ " : "";
      return `<li style="margin:0 0 8px">${checkbox}${children()}</li>`;
    }
    case "code": {
      const language = node.lang ? ` data-language="${escapeHtml(node.lang)}"` : "";
      return `<pre style="background:#151515;border-radius:8px;color:#f4f1e9;font-size:14px;line-height:1.55;margin:24px 0;overflow:auto;padding:18px;white-space:pre-wrap"><code${language}>${escapeHtml(node.value ?? "")}</code></pre>`;
    }
    case "inlineCode":
      return `<code style="background:#f1efe8;border-radius:4px;font-size:.92em;padding:2px 5px">${escapeHtml(node.value ?? "")}</code>`;
    case "link":
      return renderLink(node.url, node.title, children());
    case "linkReference": {
      const definition = context.definitions.get((node.identifier ?? "").toLowerCase());
      return renderLink(definition?.url, definition?.title, children());
    }
    case "image":
      return `<span style="color:#69696f;font-size:14px;font-style:italic">${escapeHtml(node.alt ? `[Image: ${node.alt}]` : "[Image omitted]")}</span>`;
    case "imageReference":
      return `<span style="color:#69696f;font-size:14px;font-style:italic">${escapeHtml(node.alt ? `[Image: ${node.alt}]` : "[Image omitted]")}</span>`;
    case "table":
      return `<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;margin:24px 0;width:100%">${(node.children ?? []).map((row, index) => renderMarkdownNode(row, { ...context, tableHeader: index === 0 })).join("")}</table>`;
    case "tableRow":
      return `<tr>${children()}</tr>`;
    case "tableCell": {
      const tag = context.tableHeader ? "th" : "td";
      const style = context.tableHeader
        ? "border-bottom:2px solid #151515;font-size:13px;text-align:left"
        : "border-bottom:1px solid #dedbd3;font-size:14px;text-align:left";
      return `<${tag} style="${style}">${children()}</${tag}>`;
    }
    case "break":
      return "<br>";
    case "thematicBreak":
      return '<hr style="border:0;border-top:1px solid #dedbd3;margin:28px 0">';
    case "html":
    case "definition":
      return "";
    default:
      return node.children ? children() : escapeHtml(node.value ?? "");
  }
}

export function renderSafeNewsletterMarkdown(markdown: string) {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as MarkdownNode;
  const definitions = new Map<string, LinkDefinition>();

  for (const node of tree.children ?? []) {
    if (node.type === "definition" && node.identifier && node.url) {
      definitions.set(node.identifier.toLowerCase(), { title: node.title, url: node.url });
    }
  }

  return renderMarkdownNode(tree, { definitions });
}

export function renderNewsletterEmailDocument(input: {
  locale: "en" | "it";
  markdown: string;
  preheader: string;
  subject: string;
  unsubscribeUrl: string;
  unsubscribeLabel: string;
}) {
  const body = renderSafeNewsletterMarkdown(input.markdown);
  const preheader = escapeHtml(plainEmailText(input.preheader));
  const subject = escapeHtml(input.subject);
  const unsubscribeUrl = escapeHtml(input.unsubscribeUrl);
  const unsubscribeLabel = escapeHtml(input.unsubscribeLabel);

  return `<!doctype html>
<html lang="${input.locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;background:#f1efe8;color:#151515;font-family:Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1efe8"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #dedbd3"><tr><td style="padding:32px 28px 12px;font-size:24px;font-weight:800;letter-spacing:-0.03em">NEURA</td></tr><tr><td style="padding:12px 28px 32px">${body}</td></tr><tr><td style="border-top:1px solid #dedbd3;padding:22px 28px;color:#69696f;font-size:12px;line-height:1.5"><a href="${unsubscribeUrl}" style="color:#69696f;text-decoration:underline">${unsubscribeLabel}</a></td></tr></table>
</td></tr></table>
</body></html>`;
}

export function renderConfirmationEmailDocument(input: {
  confirmationUrl: string;
  locale: "en" | "it";
}) {
  const confirmationUrl = escapeHtml(input.confirmationUrl);
  const copy = input.locale === "it"
    ? {
        title: "Conferma la tua iscrizione a NEURA",
        body: "Hai richiesto di ricevere il briefing NEURA. Conferma l’indirizzo email per completare l’iscrizione.",
        action: "Conferma iscrizione",
        ignore: "Se non hai effettuato la richiesta, ignora questa email.",
      }
    : {
        title: "Confirm your NEURA subscription",
        body: "You asked to receive the NEURA briefing. Confirm your email address to complete the subscription.",
        action: "Confirm subscription",
        ignore: "If you did not make this request, ignore this email.",
      };

  return `<!doctype html><html lang="${input.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(copy.title)}</title></head><body style="margin:0;background:#f1efe8;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="100%" style="max-width:620px;background:#fff;border:1px solid #dedbd3"><tr><td style="padding:32px"><div style="font-size:24px;font-weight:800">NEURA</div><h1 style="font-size:28px;line-height:1.15;margin:32px 0 16px">${escapeHtml(copy.title)}</h1><p style="color:#303033;font-size:17px;line-height:1.6">${escapeHtml(copy.body)}</p><p style="margin:28px 0"><a href="${confirmationUrl}" style="display:inline-block;background:#151515;color:#fff;padding:14px 20px;text-decoration:none;font-weight:700">${escapeHtml(copy.action)}</a></p><p style="color:#69696f;font-size:13px;line-height:1.5">${escapeHtml(copy.ignore)}</p></td></tr></table></td></tr></table></body></html>`;
}
