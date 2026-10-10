import { pageCapabilities, type PageToolName } from "@atlasnews/contract/page";
import { createSiteTools, type SiteToolsEnvironment, type ToolResult } from "./tools";

/** The part of `document.modelContext` that the site uses (WebMCP `registerTool`). */
export interface ModelContextLike {
  registerTool(
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations: object;
      execute(input: unknown, options?: { signal?: AbortSignal }): Promise<ToolResult>;
    },
    options?: { signal?: AbortSignal },
  ): Promise<unknown>;
}

const active = new WeakMap<object, () => void>();

/**
 * Registers every page capability of the catalogue with the browser's agent, once per
 * `context`, and returns the function that unregisters them. The text, schema and hints
 * come from the catalogue; only the handlers belong to the site.
 */
export function registerSiteTools(context: ModelContextLike, env: SiteToolsEnvironment): () => void {
  const registered = active.get(context);
  if (registered) return registered;

  const controller = new AbortController();
  const tools = createSiteTools(env);
  const dispose = () => {
    controller.abort();
    active.delete(context);
  };
  active.set(context, dispose);

  for (const capability of pageCapabilities) {
    const run = tools[capability.name as PageToolName];
    if (!run) continue;
    // `async` keeps a throwing `registerTool` on the same path as a rejected one.
    (async () =>
      context.registerTool(
        {
          name: capability.name,
          title: capability.title,
          description: capability.description,
          inputSchema: capability.inputSchema,
          annotations: capability.annotations,
          execute: (input, options) => run(input, options?.signal),
        },
        { signal: controller.signal },
      ))().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      console.warn(`Site tool ${capability.name} was not registered:`, error);
    });
  }
  return dispose;
}
