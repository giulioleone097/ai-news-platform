import type { Capability } from "./capability";
import { newsroomCapabilities } from "./handlers/newsroom";
import { operationsCapabilities } from "./handlers/operations";
import { publicCapabilities } from "./handlers/public";

/**
 * Every capability the server offers, defined once. Adapters (the MCP endpoint today, the
 * page tools through `@atlasnews/contract/page`) read this list and add no names of their own.
 */
export const capabilities: readonly Capability[] = [
  ...publicCapabilities,
  ...newsroomCapabilities,
  ...operationsCapabilities,
];

export const mcpCapabilities = capabilities.filter((capability) => capability.surfaces.includes("mcp"));
