import { createNavigator, sleep } from "@/components/site/site-tools/navigate";
import type { ModelContextLike } from "@/components/site/site-tools/register";
import { openArticleForm } from "./article-form-bridge";
import { registerStudioTools } from "./register";

export function startStudioSiteTools(context: ModelContextLike, push: (path: string) => void) {
  return registerStudioTools(context, {
    navigate: createNavigator(push),
    articleForm: openArticleForm,
    path: () => location.pathname,
    wait: sleep,
  });
}
