import { pageCapabilities, type PageCapability, type PageToolName } from "@atlasnews/contract/page";
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

type ToolRunner = (input: unknown, signal?: AbortSignal) => Promise<ToolResult>;

/**
 * Registers the catalogue's capabilities that `runnerFor` can run with the browser's agent, once per
 * `context` and `registry`, and returns the function that unregisters them. The text, schema and
 * hints come from the catalogue; only the handlers belong to the site. The reader site and the
 * Studio each pass their own `registry`.
 */
export function registerCapabilities(
  context: ModelContextLike,
  capabilities: readonly PageCapability[],
  runnerFor: (name: string) => ToolRunner | undefined,
  registry: WeakMap<object, () => void>,
): () => void {
  const registered = registry.get(context);
  if (registered) return registered;

  const controller = new AbortController();
  const dispose = () => {
    controller.abort();
    registry.delete(context);
  };
  registry.set(context, dispose);

  for (const capability of capabilities) {
    const run = runnerFor(capability.name);
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

/** Registers every reader capability of the catalogue with the browser's agent. */
export function registerSiteTools(context: ModelContextLike, env: SiteToolsEnvironment): () => void {
  const tools = createSiteTools(env);
  return registerCapabilities(context, pageCapabilities, (name) => tools[name as PageToolName], active);
}
