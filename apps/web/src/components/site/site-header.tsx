import Link from "next/link";
import { Search } from "lucide-react";
import {
  getMessages,
  localeLabels,
  locales,
  localizedPath,
  type Locale,
} from "@/i18n";
import { getCachedEntities } from "@/lib/editorial-queries";
import { BrandMark } from "./brand-mark";
import { HeaderNav, type NavItem } from "./locale-switcher";

const navigationProducts = 5;

export async function SiteHeader({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const products = (await getCachedEntities(locale)).filter((entity) => entity.kind === "product").slice(0, navigationProducts);
  const items: NavItem[] = [
    { href: localizedPath("/latest", locale), label: messages.latest.title, kind: "lead" },
    ...products.map((entity) => ({ href: localizedPath(`/entities/${entity.slug}`, locale), label: entity.name })),
    { href: localizedPath("/entities", locale), label: messages.navigation.allEntities, kind: "more" },
  ];

  return (
    <>
      <Link className="skip-link" href="#main-content">{messages.navigation.skipToContent}</Link>
      <header className="site-header">
        <div className="site-shell site-header__inner">
          <Link className="brand" href={localizedPath("/", locale)} aria-label={messages.navigation.homeLabel} prefetch={false}>
            <BrandMark name={messages.common.brandName} />
          </Link>
          <HeaderNav
            activeLocale={locale}
            items={items}
            navLabel={messages.navigation.primaryLabel}
            languageLabel={messages.navigation.languageLabel}
            languages={locales.map((code) => ({ code, label: localeLabels[code] }))}
            before={
              <Link className="icon-link" href={localizedPath("/search", locale)} aria-label={messages.navigation.search} prefetch={false}>
                <Search aria-hidden="true" />
              </Link>
            }
            after={
              <Link className="button button--primary button--small" href="#newsletter" prefetch={false}>
                {messages.newsletter.submit}
              </Link>
            }
          />
        </div>
      </header>
    </>
  );
}
