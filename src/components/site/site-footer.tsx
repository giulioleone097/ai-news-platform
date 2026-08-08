import Link from "next/link";
import { getMessages, localizedPath, type Locale } from "@/i18n";
import { getSocialProfiles } from "@/config/env";

export function SiteFooter({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const socialProfiles = getSocialProfiles();

  return (
    <footer className="site-footer">
      <div className="site-shell site-footer__inner">
        <Link className="brand brand--footer" href={localizedPath("/", locale)}>
          NEURA
        </Link>
        <p>{messages.footer.tagline}</p>
        <nav aria-label={messages.footer.ariaLabel}>
          <Link href={localizedPath("/latest", locale)}>{messages.footer.latest}</Link>
          <Link href={localizedPath("/search", locale)}>{messages.footer.search}</Link>
          <Link href={localizedPath("/studio", locale)}>{messages.footer.studio}</Link>
          <Link href="/api/mcp/info">{messages.footer.mcp}</Link>
          <Link href={localizedPath("/feed.xml", locale)}>{messages.footer.rss}</Link>
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
