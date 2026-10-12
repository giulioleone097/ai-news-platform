import type { Capability } from "./capability";
import { articleCapabilities } from "./handlers/articles";
import { categoryCapabilities } from "./handlers/categories";
import { commentCapabilities } from "./handlers/comments";
import { entityCapabilities } from "./handlers/entities";
import { mediaCapabilities } from "./handlers/media";
import { newsletterCapabilities } from "./handlers/newsletter";
import { newsroomCapabilities } from "./handlers/newsroom";
import { publicCapabilities } from "./handlers/public";
import { socialCapabilities } from "./handlers/social";
import { supportCapabilities } from "./handlers/support";
import { teamCapabilities } from "./handlers/team";

/**
 * Every capability the server offers, defined once. Adapters (the MCP endpoint today, the
 * page tools through `@atlasnews/contract/page`) read this list and add no names of their own.
 */
export const capabilities: readonly Capability[] = [
  ...publicCapabilities,
  ...articleCapabilities,
  ...categoryCapabilities,
  ...entityCapabilities,
  ...mediaCapabilities,
  ...newsroomCapabilities,
  ...commentCapabilities,
  ...newsletterCapabilities,
  ...socialCapabilities,
  ...supportCapabilities,
  ...teamCapabilities,
];

export const mcpCapabilities = capabilities.filter((capability) => capability.surfaces.includes("mcp"));
