import { editorPageCapabilities } from "@atlasnews/contract/page";
import { registerCapabilities, type ModelContextLike } from "@/components/site/site-tools/register";
import { createEditorTools, type EditorToolsEnvironment } from "./tools";

const active = new WeakMap<object, () => void>();

/**
 * Registers every editor capability of the catalogue with the browser's agent, once per `context`,
 * and returns the function that unregisters them. Name, text, schema and hints come from the
 * catalogue; only the handlers belong to the Studio.
 */
export function registerEditorTools(context: ModelContextLike, env: EditorToolsEnvironment): () => void {
  const tools = createEditorTools(env);
  return registerCapabilities(context, editorPageCapabilities, (name) => tools[name], active);
}
