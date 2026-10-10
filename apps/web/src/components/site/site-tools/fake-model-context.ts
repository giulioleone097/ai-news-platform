import type { ModelContextLike } from "./register";

type Tool = Parameters<ModelContextLike["registerTool"]>[0];

/** A WebMCP entry point that follows the specification's `registerTool` rules. */
export function createFakeModelContext() {
  const tools = new Map<string, Tool>();
  const calls: string[] = [];
  const context: ModelContextLike = {
    registerTool(tool, options) {
      calls.push(tool.name);
      if (tools.has(tool.name)) return Promise.reject(new DOMException("duplicate", "InvalidStateError"));
      if (options?.signal?.aborted) return Promise.reject(options.signal.reason);
      tools.set(tool.name, tool);
      options?.signal?.addEventListener("abort", () => tools.delete(tool.name));
      return Promise.resolve();
    },
  };
  return { context, tools, calls };
}
