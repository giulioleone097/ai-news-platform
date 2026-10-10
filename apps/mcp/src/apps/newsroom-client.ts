/*
 * Browser runtime of the AtlasNews newsroom MCP App. It is serialized with
 * Function#toString into the UI resource, so it must stay self-contained:
 * everything it needs arrives through `config` and `helpers`.
 *
 * It speaks the MCP Apps postMessage protocol directly (ui/initialize,
 * tools/call, ui/message, ui/update-model-context, ...) and only calls the
 * server's existing public tools, so the app adds no second data API.
 */
import type { NewsroomRoute } from "./widget-helpers";

export interface NewsroomClientConfig {
  siteOrigin: string;
  version: string;
  locales: string[];
}

export interface NewsroomClientHelpers {
  renderMarkdown(markdown: string): string;
  parseDeepLink(url: string, locales: readonly string[]): NewsroomRoute;
}

export function newsroomClient(config: NewsroomClientConfig, helpers: NewsroomClientHelpers) {
  type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  type Attachment = { slug: string; locale: string; title: string; url: string; thumbnail?: string };

  const copy: Record<string, Record<string, string>> = {
    en: { all: "All", search: "Search AI news", more: "Load more", back: "Back", attach: "Add to chat", attached: "In chat", ask: "Ask about this", newChat: "Discuss in a new chat", site: "Open on AtlasNews", min: "min read", briefing: "Your AI briefing", empty: "No stories yet.", error: "AtlasNews is temporarily unavailable.", retry: "Retry", loading: "Loading…" },
    it: { all: "Tutte", search: "Cerca notizie AI", more: "Carica altre", back: "Indietro", attach: "Aggiungi alla chat", attached: "Nella chat", ask: "Chiedi a riguardo", newChat: "Discuti in una nuova chat", site: "Apri su AtlasNews", min: "min di lettura", briefing: "Il tuo briefing AI", empty: "Ancora nessuna notizia.", error: "AtlasNews non è momentaneamente disponibile.", retry: "Riprova", loading: "Caricamento…" },
  };
  const state = {
    locale: config.locales[0], localeChosen: false, route: { view: "feed" } as NewsroomRoute,
    items: [] as Json[], nextCursor: null as string | null, categories: [] as Json[], categoriesLocale: "",
    article: null as Json | null, sections: null as Json[] | null, notice: "", loading: true, error: "",
    attached: [] as Attachment[], hostCapabilities: {} as Json, hostContext: {} as Json, hasResult: false,
    preferredLocale: "", deepLink: "/",
  };
  const root = document.getElementById("app") as HTMLElement;
  const t = (key: string) => (copy[state.locale] ?? copy.en)[key] ?? key;
  const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const absolute = (path: string) => { try { return new URL(path, config.siteOrigin).href; } catch { return ""; } };
  const httpsOnly = (url: string) => (url.startsWith("https://") ? url : undefined);

  // --- MCP Apps bridge (JSON-RPC 2.0 over postMessage) ---
  let nextId = 1;
  const pending = new Map<number, { resolve(value: Json): void; reject(error: Error): void }>();
  const post = (message: Json) => window.parent.postMessage({ jsonrpc: "2.0", ...message }, "*");
  const notify = (method: string, params: Json = {}) => post({ method, params });
  const request = (method: string, params: Json = {}) => new Promise<Json>((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("timeout")); }, 20_000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    post({ id, method, params });
  });
  async function callTool(name: string, args: Json) {
    const result = await request("tools/call", { name, arguments: args });
    if (result.isError) throw new Error(result.content?.[0]?.text ?? "Tool error");
    return (result.structuredContent ?? {}) as Json;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const message = event.data as Json;
    if (!message || message.jsonrpc !== "2.0") return;
    if (message.id !== undefined && !message.method) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiter?.reject(new Error(message.error.message ?? "error"));
      else waiter?.resolve(message.result ?? {});
      return;
    }
    if (message.id !== undefined) {
      const known = message.method === "ui/resource-teardown" || message.method === "ping";
      post(known ? { id: message.id, result: {} } : { id: message.id, error: { code: -32601, message: "Method not found" } });
      return;
    }
    if (message.method === "ui/notifications/tool-input") { state.loading = true; render(); }
    if (message.method === "ui/notifications/tool-result") applyToolResult(message.params ?? {});
    if (message.method === "ui/notifications/host-context-changed") applyHostContext(message.params ?? {});
  });

  // --- Host context: theme, styles, safe areas, locale, deep links, model context ---
  function applyHostContext(context: Json) {
    state.hostContext = { ...state.hostContext, ...context };
    const html = document.documentElement;
    if (context.theme) html.dataset.theme = context.theme;
    for (const [name, value] of Object.entries(context.styles?.variables ?? {})) {
      if (typeof value === "string" && name.startsWith("--")) html.style.setProperty(name, value);
    }
    const insets = context.safeAreaInsets;
    if (insets) for (const side of ["top", "right", "bottom", "left"]) html.style.setProperty(`--inset-${side}`, `${insets[side] ?? 0}px`);
    if (context.displayMode) html.dataset.mode = context.displayMode;
    const hostLocale = typeof context.locale === "string" ? context.locale.slice(0, 2).toLowerCase() : "";
    if (config.locales.includes(hostLocale)) {
      state.preferredLocale = hostLocale;
      if (!state.hasResult && !state.localeChosen) state.locale = hostLocale;
    }
    if ("openai/modelContext" in context) {
      const attached = context["openai/modelContext"]?.structuredContent?.attached;
      state.attached = Array.isArray(attached) ? attached : [];
    }
    const deepLink = context["openai/deepLink"]?.url;
    if (typeof deepLink === "string" && deepLink !== state.deepLink) {
      state.deepLink = deepLink;
      void navigate(helpers.parseDeepLink(deepLink, config.locales));
    } else {
      render();
    }
  }

  // --- Tool results from the model, entrypoints, or our own calls ---
  function applyToolResult(result: Json) {
    const firstResult = !state.hasResult;
    state.hasResult = true;
    state.loading = false;
    state.error = result.isError ? (result.content?.[0]?.text ?? t("error")) : "";
    const data = (result.structuredContent ?? {}) as Json;
    const locale = data.locale ?? data.article?.locale ?? data.items?.[0]?.locale;
    if (config.locales.includes(locale)) state.locale = locale;
    if (data.article) {
      state.article = data.article;
      state.route = { view: "article", locale: data.article.locale, slug: data.article.slug };
    } else if (Array.isArray(data.sections)) {
      state.sections = data.sections;
      state.route = { view: "feed", locale: state.locale };
    } else if (Array.isArray(data.items)) {
      state.sections = null;
      state.items = data.items;
      state.nextCursor = data.nextCursor ?? null;
      if (Array.isArray(data.categories)) { state.categories = data.categories; state.categoriesLocale = state.locale; }
      if (!data.query) saveCache();
    } else if (!state.error) {
      state.notice = result.content?.find((block: Json) => block.type === "text")?.text ?? "";
    }
    render();
    syncModelContext();
    // Entrypoints open with {} (English); follow the host language unless the user picked one.
    const opener = String(state.hostContext.toolInfo?.tool?.name ?? "");
    if (firstResult && opener.startsWith("open_") && state.preferredLocale && state.preferredLocale !== state.locale && !state.localeChosen && state.deepLink === "/") {
      void navigate({ view: "feed", locale: state.preferredLocale });
    }
  }

  async function navigate(route: NewsroomRoute) {
    state.route = route;
    if (route.locale) state.locale = route.locale;
    state.loading = true;
    state.error = "";
    state.notice = "";
    render();
    try {
      if (route.view === "article") {
        applyToolResult({ structuredContent: await callTool("get_article", { locale: route.locale, slug: route.slug }) });
      } else if (route.view === "search") {
        applyToolResult({ structuredContent: { ...(await callTool("search_articles", { locale: state.locale, query: route.query })), query: route.query } });
      } else {
        const args: Json = { locale: state.locale, limit: 12 };
        if (route.category) args.category = route.category;
        applyToolResult({ structuredContent: await callTool("list_articles", args) });
      }
      await loadCategories();
    } catch (error) {
      state.loading = false;
      state.error = error instanceof Error && error.message !== "timeout" ? error.message : t("error");
      render();
    }
  }

  async function loadCategories() {
    if (state.categoriesLocale === state.locale) return;
    const result = await callTool("list_categories", { locale: state.locale });
    state.categories = Array.isArray(result.categories) ? result.categories : [];
    state.categoriesLocale = state.locale;
    render();
  }

  async function loadMore() {
    if (!state.nextCursor || state.route.view !== "feed") return;
    const args: Json = { locale: state.locale, limit: 12, cursor: state.nextCursor };
    if (state.route.category) args.category = state.route.category;
    const page = await callTool("list_articles", args);
    state.items = [...state.items, ...(page.items ?? [])];
    state.nextCursor = page.nextCursor ?? null;
    render();
  }

  // --- Model context: user-chosen attachments plus hidden view context ---
  let contextTimer: ReturnType<typeof setTimeout> | undefined;
  function syncModelContext() {
    if (!state.hostCapabilities.updateModelContext) return;
    clearTimeout(contextTimer);
    contextTimer = setTimeout(() => {
      const view = state.route.view === "article" && state.article
        ? `The user is reading the AtlasNews article "${state.article.title}" (${absolute(state.article.path)}).`
        : `The user is browsing AtlasNews ${state.locale.toUpperCase()} AI news${state.route.view === "feed" && state.route.category ? ` in category ${state.route.category}` : ""}.`;
      const content: Json[] = state.attached.map((item) => ({
        type: "text",
        text: `AtlasNews article "${item.title}" (${item.url}). Fetch it with get_article {"locale":"${item.locale}","slug":"${item.slug}"}.`,
        _meta: { "openai/title": item.title, ...(item.thumbnail ? { "openai/thumbnail": { src: item.thumbnail } } : {}) },
      }));
      content.push({ type: "text", text: view, annotations: { audience: ["assistant"] } });
      void request("ui/update-model-context", {
        content,
        structuredContent: { app: "atlasnews-newsroom", route: state.route, attached: state.attached },
      }).catch(() => undefined);
    }, 250);
  }

  function currentAttachment(): Attachment | null {
    const article = state.article;
    if (!article) return null;
    return { slug: article.slug, locale: article.locale, title: article.title, url: absolute(article.path), thumbnail: httpsOnly(absolute(article.coverImage)) };
  }

  async function act(action: string, target: HTMLElement) {
    const data = target.dataset;
    if (action === "locale" && data.locale) { state.locale = data.locale; state.localeChosen = true; return navigate({ view: "feed", locale: data.locale }); }
    if (action === "category") return navigate({ view: "feed", locale: state.locale, category: data.category || undefined });
    if (action === "back" || action === "retry") return navigate({ view: "feed", locale: state.locale });
    if (action === "more") return loadMore();
    if (action === "open" && data.slug && data.locale) {
      if (state.hostContext.displayMode === "inline" && state.hostContext.availableDisplayModes?.includes("fullscreen")) {
        void request("ui/request-display-mode", { mode: "fullscreen" }).catch(() => undefined);
      }
      return navigate({ view: "article", locale: data.locale, slug: data.slug });
    }
    const attachment = currentAttachment();
    if (action === "attach" && attachment) {
      const exists = state.attached.some((item) => item.url === attachment.url);
      state.attached = exists ? state.attached.filter((item) => item.url !== attachment.url) : [...state.attached, attachment];
      render();
      return syncModelContext();
    }
    if ((action === "ask" || action === "new-chat") && attachment) {
      const text = state.locale === "it"
        ? `Spiegami perché è importante l'articolo AtlasNews "${attachment.title}" (${attachment.url}) e cosa tenere d'occhio.`
        : `Explain why the AtlasNews article "${attachment.title}" (${attachment.url}) matters and what to watch next.`;
      const meta = action === "new-chat" ? { _meta: { "openai/message": { target: "new", send: false } } } : {};
      return void request("ui/message", { role: "user", content: [{ type: "text", text }], ...meta }).catch(() => undefined);
    }
    if (action === "external") {
      const url = target.getAttribute("href") ?? (attachment?.url ?? "");
      if (state.hostCapabilities.openLinks) return void request("ui/open-link", { url }).catch(() => undefined);
      window.open(url, "_blank", "noopener");
    }
  }

  root.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!target) return;
    event.preventDefault();
    void act(target.dataset.action ?? "", target);
  });
  root.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = new FormData(event.target as HTMLFormElement).get("q")?.toString().trim() ?? "";
    if (query.length >= 2) void navigate({ view: "search", locale: state.locale, query: query.slice(0, 160) });
  });

  // --- Rendering ---
  const date = (value: string) => { try { return new Intl.DateTimeFormat(state.locale, { dateStyle: "medium" }).format(new Date(value)); } catch { return ""; } };
  const card = (item: Json) => `<article class="card" data-action="open" data-slug="${escape(item.slug)}" data-locale="${escape(item.locale)}" tabindex="0">
    <p class="kicker">${escape(item.category?.name)} · ${escape(date(item.publishedAt))}</p>
    <h3>${escape(item.title)}</h3><p class="excerpt">${escape(item.excerpt)}</p>
    <p class="meta">${escape(item.readingMinutes)} ${t("min")}</p></article>`;

  function render() {
    const header = `<header class="bar"><strong class="brand">AtlasNews</strong>
      <form class="search" role="search"><input name="q" type="search" minlength="2" maxlength="160" placeholder="${t("search")}" aria-label="${t("search")}" value="${state.route.view === "search" ? escape(state.route.query) : ""}"></form>
      <nav class="locales">${config.locales.map((locale) => `<button data-action="locale" data-locale="${locale}" aria-pressed="${locale === state.locale}">${locale.toUpperCase()}</button>`).join("")}</nav></header>`;
    let body = "";
    if (state.error) body = `<p class="status">${escape(state.error)}</p><button data-action="retry">${t("retry")}</button>`;
    else if (state.loading && !state.items.length && !state.article) body = `<p class="status">${t("loading")}</p>`;
    else if (state.route.view === "article" && state.article) {
      const article = state.article;
      const isAttached = state.attached.some((item) => item.url === absolute(article.path));
      const canStartChat = Boolean(state.hostCapabilities.experimental?.["openai/message"]);
      body = `<button class="link" data-action="back">← ${t("back")}</button>
        <article class="story"><p class="kicker">${escape(article.category?.name)} · ${escape(date(article.publishedAt))} · ${escape(article.readingMinutes)} ${t("min")}</p>
        <h1>${escape(article.title)}</h1><p class="lede">${escape(article.excerpt)}</p>
        ${article.coverImage ? `<img class="cover" src="${escape(absolute(article.coverImage))}" alt="${escape(article.coverAlt)}">` : ""}
        <div class="actions">
          ${state.hostCapabilities.updateModelContext ? `<button data-action="attach" aria-pressed="${isAttached}">${isAttached ? t("attached") : t("attach")}</button>` : ""}
          ${state.hostCapabilities.message ? `<button data-action="ask">${t("ask")}</button>` : ""}
          ${canStartChat ? `<button data-action="new-chat">${t("newChat")}</button>` : ""}
          <a href="${escape(absolute(article.path))}" data-action="external">${t("site")} ↗</a></div>
        <div class="prose">${helpers.renderMarkdown(String(article.content ?? ""))}</div>
        <p class="meta">${escape(article.author?.name)} · ${escape(article.author?.role)}</p></article>`;
    } else if (state.sections) {
      body = `<h2>${t("briefing")}</h2>${state.sections.map((section) => `<section><h3 class="section">${escape(section.category?.name)}</h3>${(section.items ?? []).map(card).join("") || `<p class="status">${t("empty")}</p>`}</section>`).join("")}`;
    } else {
      const active = state.route.view === "feed" ? state.route.category ?? "" : null;
      const chips = state.categories.length && active !== null
        ? `<nav class="chips"><button data-action="category" data-category="" aria-pressed="${active === ""}">${t("all")}</button>${state.categories.map((category) => `<button data-action="category" data-category="${escape(category.slug)}" aria-pressed="${active === category.slug}">${escape(category.name)}</button>`).join("")}</nav>`
        : "";
      body = `${chips}${state.notice ? `<p class="status">${escape(state.notice)}</p>` : ""}${state.items.map(card).join("") || `<p class="status">${t("empty")}</p>`}
        ${state.nextCursor && state.route.view === "feed" ? `<button class="more" data-action="more">${t("more")}</button>` : ""}`;
    }
    root.innerHTML = `${header}<main aria-busy="${state.loading}">${body}</main>`;
    document.documentElement.lang = state.locale;
  }

  // --- Persistence for instant global-entrypoint reopen ---
  const cacheKey = () => `atlasnews:newsroom:v1:${state.locale}`;
  function saveCache() {
    if (state.route.view !== "feed" || state.route.category) return;
    try { localStorage.setItem(cacheKey(), JSON.stringify({ items: state.items.slice(0, 12), categories: state.categories })); } catch { /* storage unavailable */ }
  }
  function restoreCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey()) ?? "null");
      if (Array.isArray(cached?.items)) { state.items = cached.items; state.loading = false; }
      if (Array.isArray(cached?.categories)) { state.categories = cached.categories; state.categoriesLocale = state.locale; }
    } catch { /* storage unavailable */ }
  }

  new ResizeObserver(() => notify("ui/notifications/size-changed", { height: Math.ceil(document.documentElement.scrollHeight) })).observe(document.body);

  async function start() {
    restoreCache();
    render();
    try {
      const result = await request("ui/initialize", {
        protocolVersion: "2026-01-26",
        appInfo: { name: "atlasnews-newsroom", version: config.version },
        appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] },
      });
      state.hostCapabilities = result.hostCapabilities ?? {};
      applyHostContext(result.hostContext ?? {});
      notify("ui/notifications/initialized");
    } catch {
      state.loading = false;
      render();
      return;
    }
    // Entrypoints and model calls deliver a tool result; a cold open without one loads the feed.
    setTimeout(() => { if (!state.hasResult && state.route.view === "feed" && !state.route.category) void navigate({ view: "feed", locale: state.locale }); }, 1_500);
  }
  void start();
}
