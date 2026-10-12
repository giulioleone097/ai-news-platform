"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

interface LocaleOption {
  code: string;
  label: string;
}

export interface NavItem {
  href: string;
  label: string;
  /** "lead" and "more" are the two fixed entries around the products: Latest first, Products last. */
  kind?: "lead" | "more";
}

/**
 * The header's two navigations, in one client module because both need the pathname: the product
 * links mark the current page, the language links keep it. The search and Subscribe links come in
 * as slots, so they stay server-rendered.
 */
export function HeaderNav({
  activeLocale,
  items,
  navLabel,
  languageLabel,
  languages,
  before,
  after,
}: {
  activeLocale: string;
  items: NavItem[];
  navLabel: string;
  languageLabel: string;
  languages: LocaleOption[];
  before: ReactNode;
  after: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <>
      <nav className="product-nav" aria-label={navLabel}>
        {items.map((item) => (
          <Link
            aria-current={pathname.replace(/\/$/, "") === item.href ? "page" : undefined}
            className={item.kind ? `product-nav__${item.kind}` : undefined}
            href={item.href}
            key={item.href}
            prefetch={false}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="site-header__actions">
        {before}
        <nav className="locale-switcher" aria-label={languageLabel}>
          {languages.map((option) => {
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
        {after}
      </div>
    </>
  );
}
