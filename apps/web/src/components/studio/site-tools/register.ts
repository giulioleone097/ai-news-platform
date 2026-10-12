import { studioPageCapabilities, type StudioToolName } from "@atlasnews/contract/page";
import { registerCapabilities, type ModelContextLike } from "@/components/site/site-tools/register";
import { createStudioTools, type StudioToolsEnvironment } from "./tools";

const active = new WeakMap<object, () => void>();

/**
 * Registers the Studio's page tools with the browser's agent, once per `context`, and returns the function that
 * unregisters them. Name, text, schema and hints come from the catalogue; only the handlers belong to the Studio.
 */
export function registerStudioTools(context: ModelContextLike, env: StudioToolsEnvironment): () => void {
  const tools = createStudioTools(env);
  return registerCapabilities(context, studioPageCapabilities, (name) => tools[name as StudioToolName], active);
}
