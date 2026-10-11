import Link from "next/link";
import { getMessages, localizedPath, type Locale } from "@/i18n";
import { getPublicCategories } from "@/lib/editorial-queries";
import { getPublicMcpUrl, getSocialProfiles } from "@atlasnews/adapters/config/env";

export async function SiteFooter({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const socialProfiles = getSocialProfiles();
  const categories = await getPublicCategories(locale);

  return (
    <footer className="site-footer">
      <div className="site-shell site-footer__inner">
        <Link className="brand brand--footer" href={localizedPath("/", locale)} prefetch={false}>
          {messages.common.brandName}
        </Link>
        <p>{messages.footer.tagline}</p>
        <nav aria-label={messages.footer.ariaLabel}>
          <Link href={localizedPath("/latest", locale)} prefetch={false}>{messages.footer.latest}</Link>
          <Link href={localizedPath("/entities", locale)} prefetch={false}>{messages.navigation.allEntities}</Link>
          {categories.map((category) => (
            <Link href={localizedPath(`/categories/${category.slug}`, locale)} key={category.id} prefetch={false}>
              {category.name}
            </Link>
          ))}
          <Link href={localizedPath("/search", locale)} prefetch={false}>{messages.footer.search}</Link>
          <Link href={localizedPath("/support", locale)} prefetch={false}>{messages.footer.support}</Link>
          <Link href={localizedPath("/privacy", locale)} prefetch={false}>{messages.footer.privacy}</Link>
          <Link href={localizedPath("/terms", locale)} prefetch={false}>{messages.footer.terms}</Link>
          <Link href={localizedPath("/studio", locale)} prefetch={false}>{messages.footer.studio}</Link>
          <a href={new URL("/info", getPublicMcpUrl()).toString()}>{messages.footer.mcp}</a>
          <Link href={localizedPath("/feed.xml", locale)} prefetch={false}>{messages.footer.rss}</Link>
          {socialProfiles.linkedin ? (
            <a href={socialProfiles.linkedin} rel="noreferrer" target="_blank">
              {messages.footer.linkedIn}
            </a>
          ) : null}
          {socialProfiles.x ? (
            <a href={socialProfiles.x} rel="noreferrer" target="_blank">{messages.footer.x}</a>
          ) : null}
        </nav>
        <small>{messages.footer.copyright}</small>
      </div>
    </footer>
  );
}
