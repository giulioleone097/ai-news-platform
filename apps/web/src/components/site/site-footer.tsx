import Link from "next/link";
import { getMessages, localizedPath, type Locale } from "@/i18n";
import { getPublicCategories } from "@/lib/editorial-queries";
import { getPublicMcpUrl, getSocialProfiles } from "@atlasnews/adapters/config/env";
import { BrandMark } from "./brand-mark";

export async function SiteFooter({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const socialProfiles = getSocialProfiles();
  const categories = await getPublicCategories(locale);

  return (
    <footer className="site-footer">
      <div className="site-shell site-footer__inner">
        <div className="site-footer__intro">
          <Link className="brand" href={localizedPath("/", locale)} prefetch={false}>
            <BrandMark name={messages.common.brandName} />
          </Link>
          <p>{messages.footer.tagline}</p>
        </div>
        <nav aria-label={messages.footer.ariaLabel} className="site-footer__nav">
          <div>
            <h2>{messages.footer.groups.sections}</h2>
            <ul>
              <li><Link href={localizedPath("/latest", locale)} prefetch={false}>{messages.footer.latest}</Link></li>
              <li><Link href={localizedPath("/entities", locale)} prefetch={false}>{messages.navigation.allEntities}</Link></li>
              {categories.map((category) => (
                <li key={category.id}>
                  <Link href={localizedPath(`/categories/${category.slug}`, locale)} prefetch={false}>{category.name}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>{messages.footer.groups.publication}</h2>
            <ul>
              <li><Link href={localizedPath("/search", locale)} prefetch={false}>{messages.footer.search}</Link></li>
              <li><Link href={localizedPath("/support", locale)} prefetch={false}>{messages.footer.support}</Link></li>
              <li><Link href={localizedPath("/privacy", locale)} prefetch={false}>{messages.footer.privacy}</Link></li>
              <li><Link href={localizedPath("/terms", locale)} prefetch={false}>{messages.footer.terms}</Link></li>
              {socialProfiles.linkedin ? (
                <li><a href={socialProfiles.linkedin} rel="noreferrer" target="_blank">{messages.footer.linkedIn}</a></li>
              ) : null}
              {socialProfiles.x ? (
                <li><a href={socialProfiles.x} rel="noreferrer" target="_blank">{messages.footer.x}</a></li>
              ) : null}
            </ul>
          </div>
          <div>
            <h2>{messages.footer.groups.tools}</h2>
            <ul>
              <li><Link href={localizedPath("/studio", locale)} prefetch={false}>{messages.footer.studio}</Link></li>
              <li><a href={new URL("/info", getPublicMcpUrl()).toString()}>{messages.footer.mcp}</a></li>
              <li><Link href={localizedPath("/feed.xml", locale)} prefetch={false}>{messages.footer.rss}</Link></li>
            </ul>
          </div>
        </nav>
        <small className="site-footer__legal">{messages.footer.copyright}</small>
      </div>
    </footer>
  );
}
