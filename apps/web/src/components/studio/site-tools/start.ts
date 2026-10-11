import type { Locale } from "@atlasnews/core/locale";
import type { ModelContextLike } from "@/components/site/site-tools/register";
import { createConfirmPresenter } from "./confirm-dialog";
import { registerEditorTools } from "./register";

export function startStudioSiteTools(context: ModelContextLike, options: { locale: Locale; isAdmin: boolean; refresh: () => void }) {
  const presenter = createConfirmPresenter(document, options.locale);
  const unregister = registerEditorTools(context, {
    fetch: (input, init) => fetch(input, init),
    confirm: presenter.confirm,
    refresh: options.refresh,
  }, { isAdmin: options.isAdmin });
  return () => {
    unregister();
    presenter.dispose();
  };
}
