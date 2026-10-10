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
import { LocaleSwitcher } from "./locale-switcher";

const navigationEntities = 6;

export async function SiteHeader({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const entities = (await getCachedEntities(locale)).slice(0, navigationEntities);

  return (
    <>
      <Link className="skip-link" href="#main-content">{messages.navigation.skipToContent}</Link>
      <header className="site-header">
        <div className="site-header__inner">
          <Link className="brand" href={localizedPath("/", locale)} aria-label={messages.navigation.homeLabel} prefetch={false}>
            {messages.common.brandName}
          </Link>
          <nav className="entity-nav chip-row" aria-label={messages.navigation.primaryLabel}>
            <Link className="chip" href={localizedPath("/", locale)} prefetch={false}>{messages.common.all}</Link>
            {entities.map((entity) => (
              <Link className="chip" href={localizedPath(`/entities/${entity.slug}`, locale)} key={entity.slug} prefetch={false}>
                {entity.name}
              </Link>
            ))}
            <Link className="chip chip--quiet" href={localizedPath("/entities", locale)} prefetch={false}>
              {messages.navigation.allEntities}
            </Link>
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
          </div>
        </div>
      </header>
    </>
  );
}
