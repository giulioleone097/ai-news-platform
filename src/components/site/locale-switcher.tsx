"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";

interface LocaleOption {
  code: string;
  label: string;
}

export function LocaleSwitcher({
  activeLocale,
  label,
  options,
}: {
  activeLocale: string;
  label: string;
  options: LocaleOption[];
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="locale-switcher" aria-label={label}>
      {options.map((option) => {
        const href = pathname.replace(/^\/(?:en|it)(?=\/|$)/, `/${option.code}`);
        const preserveLocationState = (event: MouseEvent<HTMLAnchorElement>) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          if (!window.location.search && !window.location.hash) return;
          event.preventDefault();
          router.push(`${href}${window.location.search}${window.location.hash}`);
        };
        return (
          <Link
            aria-current={option.code === activeLocale ? "page" : undefined}
            href={href || `/${option.code}`}
            hrefLang={option.code}
            key={option.code}
            lang={option.code}
            onClick={preserveLocationState}
            prefetch={false}
          >
            <span className="locale-switcher__short">{option.code.toUpperCase()}</span>
            <span className="sr-only">{option.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
