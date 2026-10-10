import { locales } from "@atlasnews/core/locale";

import { newsroomClient } from "./newsroom-client";
import { parseDeepLink, renderMarkdown } from "./widget-helpers";

const styles = `
:root{color-scheme:light dark;--accent:#F26722;--bg:var(--color-background-primary,#fff);--bg2:var(--color-background-secondary,#f6f6f4);
--fg:var(--color-text-primary,#151515);--fg2:var(--color-text-secondary,#5c5c5c);--line:var(--color-border-primary,rgba(0,0,0,.12));
--radius:var(--border-radius-lg,14px);font-family:var(--font-sans,ui-sans-serif,system-ui,sans-serif);}
:root[data-theme=dark]{--bg:var(--color-background-primary,#171717);--bg2:var(--color-background-secondary,#222);
--fg:var(--color-text-primary,#f2f2f2);--fg2:var(--color-text-secondary,#a8a8a8);--line:var(--color-border-primary,rgba(255,255,255,.14));}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--fg)}
body{padding:calc(12px + var(--inset-top,0px)) calc(14px + var(--inset-right,0px)) calc(14px + var(--inset-bottom,0px)) calc(14px + var(--inset-left,0px))}
button,input{font:inherit;color:inherit}button{cursor:pointer;border:1px solid var(--line);background:var(--bg2);border-radius:999px;padding:6px 12px}
button[aria-pressed=true]{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}.brand{letter-spacing:.14em;color:var(--accent)}
.search{flex:1;min-width:160px}.search input{width:100%;border:1px solid var(--line);border-radius:999px;padding:7px 12px;background:var(--bg2)}
.locales{display:flex;gap:4px}.chips{display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;margin-bottom:6px}.chips button{white-space:nowrap}
.card{border-top:1px solid var(--line);padding:12px 2px;cursor:pointer}.card:hover h3{color:var(--accent)}
.card h3{margin:2px 0 4px;font-size:1.02rem;line-height:1.3}.kicker,.meta{margin:0;color:var(--fg2);font-size:.78rem}
.excerpt{margin:0 0 4px;color:var(--fg2);font-size:.9rem;line-height:1.45}.section{margin:16px 0 4px;color:var(--accent);font-size:.85rem;text-transform:uppercase;letter-spacing:.08em}
.story h1{font-size:1.6rem;line-height:1.2;margin:6px 0}.lede{font-size:1.05rem;color:var(--fg2);line-height:1.5}
.cover{width:100%;border-radius:var(--radius);aspect-ratio:16/9;object-fit:cover;background:var(--bg2)}
.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}.actions a{color:var(--accent)}
.prose{line-height:1.65;font-size:1rem}.prose img{max-width:100%}.prose pre{overflow:auto;background:var(--bg2);padding:10px;border-radius:8px}
.prose blockquote{margin:0;padding-left:12px;border-left:3px solid var(--accent);color:var(--fg2)}
.link{border:0;background:none;padding:4px 0;color:var(--fg2)}.more{display:block;margin:14px auto 0}.status{color:var(--fg2)}
:root[data-mode=fullscreen] main{max-width:760px;margin:0 auto}
@media (max-width:420px){.bar{gap:6px}.story h1{font-size:1.35rem}}
`;

/** Self-contained MCP App HTML: inline styles and script, no network code beyond images. */
export function renderNewsroomWidget(options: { siteOrigin: string; version: string }) {
  const config = JSON.stringify({ siteOrigin: options.siteOrigin, version: options.version, locales })
    .replace(/</g, "\\u003c");
  const script = `(${newsroomClient.toString()})(${config},{renderMarkdown:${renderMarkdown.toString()},parseDeepLink:${parseDeepLink.toString()}});`;
  if (/<\/script/i.test(script)) throw new Error("Newsroom widget script must not contain a closing script tag.");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NEURA</title><style>${styles}</style></head><body><div id="app" aria-live="polite"></div><script>${script}</script></body></html>`;
}
