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
            <h2>{messages.footer.groups.topics}</h2>
            <ul>
              {categories.map((category) => (
                <li key={category.id}>
                  <Link href={localizedPath(`/categories/${category.slug}`, locale)} prefetch={false}>{category.name}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>{messages.footer.groups.follow}</h2>
            <ul>
              <li><Link href={localizedPath("/latest", locale)} prefetch={false}>{messages.footer.latest}</Link></li>
              <li><Link href={localizedPath("/entities", locale)} prefetch={false}>{messages.navigation.allEntities}</Link></li>
              <li><Link href={localizedPath("/feed.xml", locale)} prefetch={false}>{messages.footer.rss}</Link></li>
              <li><Link href="#newsletter" prefetch={false}>{messages.footer.newsletter}</Link></li>
            </ul>
          </div>
          <div>
            <h2>{messages.footer.groups.about}</h2>
            <ul>
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
        </nav>
        <div className="site-footer__legal">
          <small>{messages.footer.copyright.replace("{year}", String(new Date().getUTCFullYear()))}</small>
          <Link href={localizedPath("/studio", locale)} prefetch={false}>{messages.footer.studio}</Link>
          <a href={new URL("/info", getPublicMcpUrl()).toString()}>{messages.footer.mcp}</a>
        </div>
      </div>
    </footer>
  );
}
