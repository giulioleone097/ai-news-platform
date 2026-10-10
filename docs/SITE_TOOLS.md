# Site tools (WebMCP)

An AI agent that looks at the reader site in a browser can use the site through five tools that the page registers itself. The agent and the reader share one live page: when the agent searches, the page shows the results.

## The tools

| Tool | What it does | Changes |
| --- | --- | --- |
| `search_articles` | Searches published stories through `GET /api/articles`, shows `/{locale}/search?q=` and returns the items. | page only |
| `filter_feed` | Shows the home feed, an entity feed (`/entities/{slug}`) or a status feed (`/status/{status}`) and returns the stories. | page only |
| `open_article` | Opens one story, then returns its path and title. | page only |
| `read_open_article` | Returns the story on screen: title, URL, status, entities and the Markdown text (key points and sources included). An error when no story is open. | nothing |
| `save_article` | Adds a story to the bookmarks of this browser (`localStorage` key `atlasnews:saved`, the store of the bookmark button). | bookmarks |

Every tool answers with a JSON object. When it cannot do the work it answers `{ "error": "..." }` and does not throw, because a WebMCP host does not pass the message of a thrown error to the agent. Bad arguments are checked against the catalogue's schema first.

Limits that the results state: the site has no feed for an entity and a status together, and the search page has no entity or status filter. In those cases the page shows the entity feed (or the plain search) and the result lists the ignored filter in `notShownOnPage`; the returned stories still match every filter.

## Where they are defined

- Name, title, description, input schema and hints: `packages/contract/src/specs/page.ts` and `search-articles.ts` (shared with the MCP endpoint), published as plain data by `@atlasnews/contract/page`. The web app writes no tool text and no schema.
- Handlers: `apps/web/src/components/site/site-tools/`
  - `site-tools.tsx` is mounted in `app/[locale]/(site)/layout.tsx`. It renders nothing and loads nothing unless `document.modelContext.registerTool` exists.
  - `start.ts` loads on demand, together with `register.ts` (registers the catalogue's capabilities), `tools.ts` (the handlers) and `environment.ts` (router, DOM, bookmarks).
  - The story page marks its `<article>` with `data-article-id`, `data-article-slug` and `data-claim-status`, so that `read_open_article` and `save_article` know which story is open.
- A new page capability needs a spec in `specs/page.ts`, an entry in `pageSpecs`, an input in `page.ts`, and a handler in `tools.ts` (the compiler asks for it).

How it behaves in the browser:

- Visitors without WebMCP download only the loader (about 0.3 KB compressed). The tools code is a separate chunk that is requested after the feature check.
- Tools are registered once for the whole reader site, and kept through client-side navigation. Each registration gets an `AbortSignal`, so leaving the site layout (for example to the login page) unregisters them.
- Navigation uses the app router, not a page load, so the tools stay registered and the result can say where the page is.

## Test in ChatGPT's built-in browser

1. Update the ChatGPT desktop app, pick GPT-5.6 Sol or GPT-6 Sol, and keep **Enable site tools** on in Settings > Browser > Permissions.
2. Open the site in the built-in browser (a deployed URL, or a local `pnpm start` build) and select **Site tools** in the address bar: five tools should be listed under **Available site tools**.
3. Ask: "Search the site for agents, open the first story, read it and save it." Check that the page moves to the results and then to the story, and that the bookmark button of the story turns on.

Without ChatGPT, the same API exists in Chrome (flag `chrome://flags/#enable-webmcp-testing`), and `document.modelContext.getTools()` and `executeTool()` list and run the tools.

## Limits from OpenAI

Source: <https://learn.chatgpt.com/docs/webmcp.md>.

- Desktop app only: the tools work in the built-in browser of the ChatGPT desktop app, with ChatGPT Work and Codex.
- Use GPT-5.6 Sol or GPT-6 Sol. GPT-5.6 Luna has WebMCP disabled. Update the app to the latest version.
- Enterprise workspaces: an admin must allow **Site tools** in the workspace policy. Edu workspaces have no site tools. Availability also depends on the rollout and on the tools of the current page.
- Only the imperative JavaScript API works. Tools declared with HTML form attributes, and tools registered in iframes, are not discovered.
- Tools belong to the page: closing or leaving the page can make them unavailable.
- Tool definitions and results are untrusted content for the agent. Each call gets a safety review, and the normal confirmation rules apply.

The API follows the WebMCP draft (<https://webmachinelearning.github.io/webmcp/>) and Chrome's guide (<https://developer.chrome.com/docs/ai/webmcp>): `document.modelContext.registerTool(tool, { signal })`.
