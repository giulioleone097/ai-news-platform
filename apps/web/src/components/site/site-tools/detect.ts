import type { ModelContextLike } from "./register";

/** The browser's WebMCP entry point (`document.modelContext`), or null where there is none. */
export function findModelContext(doc: object): ModelContextLike | null {
  const context = (doc as { modelContext?: Partial<ModelContextLike> }).modelContext;
  return typeof context?.registerTool === "function" ? (context as ModelContextLike) : null;
}
