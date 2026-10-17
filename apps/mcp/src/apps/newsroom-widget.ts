import { locales } from "@atlasnews/core/locale";

import { newsroomClient } from "./newsroom-client";
import { parseDeepLink, renderMarkdown } from "./widget-helpers";

const styles = (brandIconUrl: string) => `
:root{color-scheme:light dark;--accent:#ffd60a;--on-accent:#111214;--bg:var(--color-background-primary,#fff);--bg2:var(--color-background-secondary,#f6f6f4);
--fg:var(--color-text-primary,#111214);--fg2:var(--color-text-secondary,#5c5c5c);--line:var(--color-border-primary,rgba(0,0,0,.12));
--radius:var(--border-radius-lg,0.5rem);font-family:var(--font-sans,ui-sans-serif,system-ui,sans-serif);}
:root[data-theme=dark]{--bg:var(--color-background-primary,#171717);--bg2:var(--color-background-secondary,#222);
--fg:var(--color-text-primary,#f2f2f2);--fg2:var(--color-text-secondary,#a8a8a8);--line:var(--color-border-primary,rgba(255,255,255,.14));}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--fg)}
body{padding:calc(0.75rem + var(--inset-top,0rem)) calc(0.875rem + var(--inset-right,0rem)) calc(0.875rem + var(--inset-bottom,0rem)) calc(0.875rem + var(--inset-left,0rem))}
button,input{font:inherit;color:inherit}button{cursor:pointer;border:1px solid var(--line);background:var(--bg2);border-radius:0.5rem;padding:0.375rem 0.75rem;font-weight:600}
button[aria-pressed=true]{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
.bar{display:flex;gap:0.625rem;align-items:center;flex-wrap:wrap;margin-bottom:0.75rem}.brand{font-weight:800;letter-spacing:-.03em}
.brand::before{content:"";display:inline-block;width:1em;height:1em;margin-right:.4em;vertical-align:middle;background:url(${JSON.stringify(brandIconUrl)}) center / contain no-repeat}
.search{flex:1;min-width:10rem}.search input{width:100%;border:1px solid var(--line);border-radius:0.25rem;padding:0.4375rem 0.75rem;background:var(--bg)}
.locales{display:flex;gap:0.25rem}.chips{display:flex;gap:0.375rem;overflow-x:auto;padding-bottom:0.5rem;margin-bottom:0.375rem}.chips button{white-space:nowrap}
.card{border-top:1px solid var(--line);padding:0.75rem 0.125rem;cursor:pointer}.card:hover h3{text-decoration:underline var(--accent);text-decoration-thickness:.16em;text-underline-offset:.14em}
.card h3{margin:0.125rem 0 0.25rem;font-size:1.02rem;line-height:1.3}.kicker,.meta{margin:0;color:var(--fg2);font-size:.78rem}
.excerpt{margin:0 0 0.25rem;color:var(--fg2);font-size:.9rem;line-height:1.45}.section{margin:1rem 0 0.25rem;padding-bottom:0.375rem;border-bottom:0.125rem solid var(--fg);font-size:.9rem}
.story h1{font-size:1.6rem;line-height:1.2;margin:0.375rem 0}.lede{font-size:1.05rem;color:var(--fg2);line-height:1.5}
.cover{width:100%;border-radius:var(--radius);aspect-ratio:16/9;object-fit:cover;background:var(--bg2)}
.actions{display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;margin:0.75rem 0}.actions a{color:var(--fg);font-weight:600;text-decoration:underline var(--accent);text-decoration-thickness:.16em;text-underline-offset:.14em}
.prose{line-height:1.65;font-size:1rem}.prose img{max-width:100%}.prose pre{overflow:auto;background:var(--bg2);padding:0.625rem;border-radius:0.5rem}
.prose blockquote{margin:0;padding-left:0.75rem;border-left:0.1875rem solid var(--accent);color:var(--fg2)}
.link{border:0;background:none;padding:0.25rem 0;color:var(--fg2)}.more{display:block;margin:0.875rem auto 0}.status{color:var(--fg2)}
:root[data-mode=fullscreen] main{max-width:47.5rem;margin:0 auto}
@media (max-width:26.25rem){.bar{gap:0.375rem}.story h1{font-size:1.35rem}}
`;

/** Self-contained MCP App HTML: inline styles and script, no network code beyond images. */
export function renderNewsroomWidget(options: { siteOrigin: string; version: string }) {
  const config = JSON.stringify({ siteOrigin: options.siteOrigin, version: options.version, locales })
    .replace(/</g, "\\u003c");
  const script = `(${newsroomClient.toString()})(${config},{renderMarkdown:${renderMarkdown.toString()},parseDeepLink:${parseDeepLink.toString()}});`;
  if (/<\/script/i.test(script)) throw new Error("Newsroom widget script must not contain a closing script tag.");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AtlasNews</title><style>${styles(new URL("/brand-mark.svg", options.siteOrigin).href)}</style></head><body><div id="app" aria-live="polite"></div><script>${script}</script></body></html>`;
}
