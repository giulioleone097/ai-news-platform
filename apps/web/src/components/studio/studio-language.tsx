"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { locales, type Locale } from "@/i18n";

/** Query parameters that mean the same in both languages; the rest (category slugs, cursors, one-time notices) do not. */
const portableParams = ["q", "status", "provider", "order"];

/** The same page in `target`. An article or campaign id belongs to one language, so those fall back to their list. */
function pathIn(target: Locale, pathname: string, search: URLSearchParams) {
  const segments = pathname.split("/");
  segments[1] = target;
  let path = segments.join("/");
  const ownId = /^(\/[a-z]{2}\/studio\/(?:articles|newsletter\/campaigns))\/(?!new$|bulk$)[^/]+/.exec(path);
  if (ownId) path = ownId[1];
  const query = new URLSearchParams();
  if (!ownId) for (const key of portableParams) if (search.has(key)) query.set(key, search.get(key)!);
  return query.size ? `${path}?${query}` : path;
}

/** EN | IT: the language of the Studio, with the current one selected. It keeps the page you are on. */
export function StudioLanguage({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname();
  const search = useSearchParams();

  return (
    <div aria-label={label} className="studio-segmented studio-language" role="group">
      {locales.map((code) => (
        <Link
          aria-current={code === locale ? "page" : undefined}
          href={pathIn(code, pathname, search)}
          hrefLang={code}
          key={code}
          lang={code}
        >
          {code.toUpperCase()}
        </Link>
      ))}
    </div>
  );
}
