# Site tools (WebMCP)

An AI agent that looks at the site in a browser can use the open page through tools that the page registers itself. The agent and the person share one live page: when the agent searches, the page shows the results; when it fills the article form, the form shows the text.

The work is split in two, so that no data tool is offered twice:

- **MCP carries data and operations**: listing, reading, creating, updating, publishing, deleting, moderating, sending. Every one of them is a catalogue capability on the MCP endpoint ([MCP.md](MCP.md)), with its scopes and confirmations.
- **WebMCP carries only what needs the open page**: the reader site's five tools, and in the Studio the editor, the form and the draft that are open on screen. They run in the browser, call no capability and save nothing.

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

- Name, title, description, input schema, hints and the shape of the result: `packages/contract/src/specs/page.ts`, published as plain data by `@atlasnews/contract/page`. The page's `search_articles` takes its name, text and input from the MCP tool of the same name (`search-articles.ts`) and declares its own result. The web app writes no tool text and no schema.
- Handlers: `apps/web/src/components/site/site-tools/`
  - `site-tools.tsx` is mounted in `app/[locale]/(site)/layout.tsx`. It renders nothing and loads nothing unless `document.modelContext.registerTool` exists.
  - `start.ts` loads on demand, together with `register.ts` (registers the catalogue's page tools), `tools.ts` (the handlers), `navigate.ts` (the app router's navigation, shared with the Studio tools) and `environment.ts` (router, DOM, bookmarks).
  - The story page marks its `<article>` with `data-article-id`, `data-article-slug` and `data-claim-status`, so that `read_open_article` and `save_article` know which story is open.
- A new page capability needs a spec in `specs/page.ts`, an entry in `pageSpecs` (or `studioPageSpecs`), an input in `page.ts`, and a handler in `tools.ts` (the compiler asks for it). A capability that reads or changes stored data is not a page tool: it is an MCP capability.

How it behaves in the browser:

- Visitors without WebMCP download only the loader (about 0.3 KB compressed). The tools code is a separate chunk that is requested after the feature check.
- Tools are registered once for the whole reader site, and kept through client-side navigation. Each registration gets an `AbortSignal`, so leaving the site layout (for example to the login page) unregisters them.
- Navigation uses the app router, not a page load, so the tools stay registered and the result can say where the page is.

## Studio tools

Inside the Studio (`/{locale}/studio/...`, not the login page) the page registers three tools for the editor that is open. The agent opens it, reads what is on screen and fills it as a draft; the person reviews the form and presses Save.

| Tool | What it does | Changes |
| --- | --- | --- |
| `open_article_editor` | Opens the article editor: a blank form for a new article in a `locale`, or, with a `slug`, the article of that locale (any status). Returns the path and the article the form edits (`null` for a new one). | the page shown |
| `read_article_form` | Returns the article form on screen: every field as it is now (title, slug, excerpt, Markdown content, category, status, scheduled date, translation link, claim status, featured, cover, distribution channels, key points, sources, entities), the article being edited, `unsaved`, and the errors the form shows under its fields. An error when no article form is open. | nothing |
| `fill_article_form` | Sets any subset of those fields in the open form and leaves the others. Returns the fields it set (`filled`), the ones it could not with the reason (`rejected`) and `saved: false`. An error when no article form is open. | the form on screen |

What they promise:

- **Nothing is saved.** `fill_article_form` only moves the fields on screen. The Save button posts the form to the Studio's Server Action, which runs the catalogue capabilities (`admin_create_article`, `admin_update_article`) with their checks, the editor's scopes and the attribution. A refused save shows its errors under the fields and keeps everything that was filled (`read_article_form` returns them in `errors`).
- **It cannot publish.** `status` takes `draft`, `review` or `scheduled` (as `admin_create_article` does); going live is `admin_publish_article` on MCP, which asks for confirmation, or the person choosing Published and pressing Publish. There is no argument for approving or saving, and the parser drops unknown keys.
- **It does not throw away the person's work.** `open_article_editor` refuses to leave a form that has unsaved changes (`unsaved: true`) for a different article, and answers with what to ask the person. Asking for the editor that is already open returns it as it is.
- **It says what it could not do.** A category that the article's locale does not have, a translation the form does not offer (only an article of the other language that has no translation yet) and an unknown entity are listed in `rejected` with the reason (for a category or a translation, the values that are valid); the rest of the patch is still applied. Lists (`distribution`, `keyPoints`, `sources`, `entities`) replace the whole list; `coverImage: null`, `translationOf: null` and `scheduledFor: null` clear them.
- **Other forms are not covered.** The tools know the article editor only. Categories, entities, the newsletter and social composers, the inbox and the team page have no page tool; an agent changes them through MCP.

Where they are defined and how they run:

- Name, title, description, input schema, hints and the shape of the result: `studioPageSpecs` in `packages/contract/src/specs/page.ts`, published as `studioPageCapabilities` by `@atlasnews/contract/page`; `parseStudioInput` checks the arguments. The field names and limits are the ones of the catalogue's article tools. No name is the name of an MCP tool (the reader site's `search_articles` is the one deliberate exception), and a test fails if another is.
- Handlers: `apps/web/src/components/studio/site-tools/`
  - `studio-site-tools.tsx` is mounted in `app/[locale]/(studio)/studio/layout.tsx`. It renders nothing and loads nothing unless `document.modelContext.registerTool` exists (same `detect.ts` as the reader tools). Leaving the Studio unmounts it, which unregisters the tools.
  - `start.ts` is the lazy chunk. `register.ts` registers the catalogue's entries through the shared `registerCapabilities` of the reader tools. `tools.ts` holds the handlers (the shared `guardTool` turns every failure into `{ "error": "..." }`).
  - `article-form-bridge.ts` is the link to the React form. `ArticleForm` registers a reader and a writer while it is mounted (`registerOpenArticleForm`) and the tools find the open form through `openArticleForm()`; nothing looks into the page's markup. `checkFill` is the one place that decides what the form accepts. The form passes its own handles to the Markdown editor and the story fields (`MarkdownEditorHandle`, `StoryFieldsHandle`).
- `open_article_editor` moves the page with the app router, so the tools stay registered, and waits for the form that was asked for. An article is opened at `/{locale}/studio/articles/{slug}`: the Studio's edit page takes the article's id or its slug.
- The Studio's Server Actions still reach the capabilities through `runEditorCapability` (`apps/web/src/server/capabilities.ts`), for the capabilities with the `studio` surface. There is no HTTP route for an agent: WebMCP has no way to call a capability.

## Test in ChatGPT's built-in browser

1. Update the ChatGPT desktop app, pick GPT-5.6 Sol or GPT-6 Sol, and keep **Enable site tools** on in Settings > Browser > Permissions.
2. Open the site in the built-in browser (a deployed URL, or a local `pnpm start` build) and select **Site tools** in the address bar: five tools should be listed under **Available site tools**.
3. Ask: "Search the site for agents, open the first story, read it and save it." Check that the page moves to the results and then to the story, and that the bookmark button of the story turns on.

Studio tools (needs an editor account):

1. Sign in to the Studio in the built-in browser and open any Studio page, such as `/en/studio`. Select **Site tools**: `open_article_editor`, `read_article_form` and `fill_article_form` should be listed, and no `admin_*` tool (those are on MCP). Opening the login page should not list them.
2. Ask: "Open a new article in English, titled 'WebMCP test', with an excerpt, and write two paragraphs about agents." The editor opens and the fields fill in on screen; nothing is saved (reload the list: there is no new article).
3. Ask: "Read the form and tell me what is missing." The agent reports from `read_article_form`. Press Save with a field missing: the errors show under the fields and the rest of the form keeps what was filled.
4. Ask the agent to open another article while the form has your edits: it must refuse and ask you to save or discard them.
5. Check that the agent cannot publish: ask it to set the status to Published; `fill_article_form` refuses it.

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
