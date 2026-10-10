import { createBrowserEnvironment } from "./environment";
import { registerSiteTools, type ModelContextLike } from "./register";

export function startSiteTools(context: ModelContextLike, push: (path: string) => void) {
  return registerSiteTools(context, createBrowserEnvironment(push));
}
