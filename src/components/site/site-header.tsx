import Link from "next/link";
import { Menu, Search, X } from "lucide-react";
import {
  getMessages,
  localeLabels,
  locales,
  localizedPath,
  type Locale,
} from "@/i18n";
import { LocaleSwitcher } from "./locale-switcher";

const categorySlugs: Record<Locale, { business: string; research: string; policy: string; tools: string }> = {
  en: { business: "business", research: "research", policy: "policy", tools: "tools" },
  it: { business: "aziende", research: "ricerca", policy: "policy", tools: "strumenti" },
};

export function SiteHeader({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const slugs = categorySlugs[locale];
  const navigation = [
    { href: localizedPath("/latest", locale), label: messages.navigation.latest },
    { href: localizedPath(`/categories/${slugs.business}`, locale), label: messages.navigation.companies },
    { href: localizedPath(`/categories/${slugs.research}`, locale), label: messages.navigation.research },
    { href: localizedPath(`/categories/${slugs.policy}`, locale), label: messages.navigation.policy },
    { href: localizedPath(`/categories/${slugs.tools}`, locale), label: messages.navigation.tools },
  ];

  return (
    <>
      <Link className="skip-link" href="#main-content">{messages.navigation.skipToContent}</Link>
      <header className="site-header">
        <div className="site-header__inner">
        <Link className="brand" href={localizedPath("/", locale)} aria-label={messages.navigation.homeLabel} prefetch={false}>
          NEURA
        </Link>
        <nav className="desktop-nav" aria-label={messages.navigation.primaryLabel}>
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} prefetch={false}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="site-header__actions">
          <LocaleSwitcher
            activeLocale={locale}
            label={messages.navigation.languageLabel}
            options={locales.map((code) => ({ code, label: localeLabels[code] }))}
          />
          <Link className="icon-link" href={localizedPath("/search", locale)} aria-label={messages.navigation.search} prefetch={false}>
            <Search aria-hidden="true" />
          </Link>
          <Link className="login-link" href={localizedPath("/login", locale)} prefetch={false}>
            {messages.navigation.signIn}
          </Link>
          <details className="mobile-menu">
            <summary aria-label={messages.navigation.openMenuLabel}>
              <Menu className="menu-open" aria-hidden="true" />
              <X className="menu-close" aria-hidden="true" />
            </summary>
            <nav aria-label={messages.navigation.mobileLabel}>
              {navigation.map((item) => (
                <Link key={item.href} href={item.href} prefetch={false}>
                  {item.label}
                </Link>
              ))}
              <Link href={localizedPath("/studio", locale)} prefetch={false}>{messages.navigation.studio}</Link>
              <Link href={localizedPath("/login", locale)} prefetch={false}>{messages.navigation.signIn}</Link>
            </nav>
          </details>
        </div>
        </div>
      </header>
    </>
  );
}
