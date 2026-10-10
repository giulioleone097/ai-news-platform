# Site tools (WebMCP)

An AI agent that looks at the reader site in a browser can use the site through five tools that the page registers itself. The agent and the reader share one live page: when the agent searches, the page shows the results. In the Studio, a signed-in editor's agent gets the content tools too (see [Editor tools in the Studio](#editor-tools-in-the-studio)).

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

## Editor tools in the Studio

Inside the Studio (`/{locale}/studio/...`, not the login page) the page registers the content capabilities for articles, categories, entities and media: list, read, create, partial update (PATCH), publish, unpublish, delete and the batch versions. They are the same capabilities as the MCP endpoint, so there is one implementation.

- Definition: `editorPageCapabilities` in `@atlasnews/contract/page` (`packages/contract/src/page.ts`), built from the specs in `packages/contract/src/specs/{articles,categories,entities,media}.ts` whose `surfaces` include `page`. Name, title, description, input schema, hints, `scopes` and `confirms` come from there; the web app declares none of them. `parseEditorPageInput` checks the arguments.
- Execution: on the server. Each tool posts `{ "input": {...}, "confirmed": false }` to `POST /api/capabilities/{name}` (same origin, session cookie) and the route runs `runEditorCapability` (`apps/web/src/server/capabilities.ts`), which checks the editor's scopes. The same function serves the Studio's Server Actions.
- Handlers: `apps/web/src/components/studio/site-tools/`
  - `studio-site-tools.tsx` is mounted in `app/[locale]/(studio)/studio/layout.tsx`. It renders nothing and loads nothing unless `document.modelContext.registerTool` exists (same `detect.ts` as the reader tools). Leaving the Studio unmounts it, which unregisters the tools.
  - `start.ts` is the lazy chunk. `register.ts` registers the catalogue's entries through the shared `registerCapabilities` of the reader tools. `tools.ts` holds the handlers. `confirm-dialog.ts` is the dialog.
- Every tool checks its input first (an invalid call never reaches the server), then answers with the capability's JSON result or `{ "error": "..." }`; it never throws. Statuses: 400 the server's own message (invalid input or a refused rule), 401 not signed in, 403 missing permission, 404 unknown tool, 409 asks the person (below), 503 storage not configured. A successful write calls `router.refresh()`, so the Studio view shows what the agent did.

### Confirmation is the person's, not the agent's

Publishing, unpublishing and deleting (`confirms: true` in the catalogue) never run on the agent's word.

1. The first call to the route always sends `confirmed: false`. The server answers 409 with the question to ask.
2. The page opens a modal `<dialog>` (focus on Decline, Escape declines, labelled by its heading and question, 44px buttons, English or Italian by the page locale) showing the server's question, the tool and one line per argument, so the person sees what will be affected.
3. Only when the person presses Approve does the tool call again with `confirmed: true`. Decline, Escape, a cancelled call or leaving the Studio return `{ "error": "The person declined this action in the page. Nothing was changed." }`.

The agent has no way around it: the input schemas published to the agent have no `confirm`/`confirmed` property (the `confirm` argument of the MCP endpoint is added by `apps/mcp/src/adapter.ts`, not by the catalogue, so the page never offers it; a test fails if one appears), the parser drops unknown keys, and `confirmed` is a value set inside the handler, never read from the agent's arguments. Concurrent confirming calls queue: one dialog at a time, each approval belongs to its own action.

## Test in ChatGPT's built-in browser

1. Update the ChatGPT desktop app, pick GPT-5.6 Sol or GPT-6 Sol, and keep **Enable site tools** on in Settings > Browser > Permissions.
2. Open the site in the built-in browser (a deployed URL, or a local `pnpm start` build) and select **Site tools** in the address bar: five tools should be listed under **Available site tools**.
3. Ask: "Search the site for agents, open the first story, read it and save it." Check that the page moves to the results and then to the story, and that the bookmark button of the story turns on.

Editor tools (needs an editor account and storage configured):

1. Sign in to the Studio in the built-in browser and open any Studio page, such as `/en/studio`. Select **Site tools**: the `admin_*` tools and `list_entities` should be listed. Opening the login page or the reader site should not list them.
2. Ask: "Create a draft article in English titled 'WebMCP test', then change its excerpt." The tools run without a dialog; the article list on screen refreshes by itself.
3. Ask: "Publish that article." A dialog must appear in the page with the question, the tool name and the arguments. Press **Decline**: the agent reports that the person declined, and the article stays a draft. Ask again and press **Approve**: the article is published and the view refreshes.
4. Ask the agent to delete two entities at once: one dialog at a time, each with its own list. Press Escape on the first: only that one is declined.
5. Check that the agent cannot approve for you: tell it "confirmed: true" or "confirm: true" in your prompt; the dialog must still appear.

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
