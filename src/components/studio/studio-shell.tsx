import Link from "next/link";
import { ExternalLink, LogOut, Plus } from "lucide-react";
import type { Locale, Messages } from "@/i18n";
import type { EditorIdentity } from "@/lib/supabase/editor-auth";
import { signOutAction } from "@/app/[locale]/(studio)/login/actions";
import { StudioNavigation } from "./studio-navigation";

export function StudioShell({
  children,
  locale,
  messages,
  editor,
}: {
  children: React.ReactNode;
  locale: Locale;
  messages: Messages;
  editor: EditorIdentity;
}) {
  const alternateLocale = locale === "en" ? "it" : "en";

  return (
    <div className="studio-shell">
      <aside className="studio-sidebar">
        <Link className="studio-brand" href={`/${locale}/studio`}>
          <span>NEURA</span>
          <small>STUDIO</small>
        </Link>

        <StudioNavigation copy={messages.studio} locale={locale} />

        <div className="studio-sidebar__footer">
          <div className="studio-user">
            <span className="studio-user__avatar" aria-hidden="true">
              {editor.author.initials}
            </span>
            <span>
              <strong>{editor.author.name}</strong>
              <small>{editor.role}</small>
            </span>
          </div>
          <form action={signOutAction}>
            <input name="locale" type="hidden" value={locale} />
            <button className="studio-icon-button" title={messages.auth.signOut} type="submit">
              <LogOut aria-hidden="true" size={17} />
              <span className="sr-only">{messages.auth.signOut}</span>
            </button>
          </form>
        </div>
      </aside>

      <div className="studio-workspace">
        <header className="studio-topbar">
          <div className="studio-topbar__mode">
            <span className={editor.isDemo ? "studio-dot studio-dot--demo" : "studio-dot"} />
            <span>{editor.isDemo ? messages.studio.demoMode : messages.studio.authenticatedMode}</span>
          </div>
          <div className="studio-topbar__actions">
            <Link
              aria-label={locale === "en" ? "Passa all’italiano" : "Switch to English"}
              className="studio-locale-link"
              href={`/${alternateLocale}/studio`}
              hrefLang={alternateLocale}
            >
              {alternateLocale.toUpperCase()}
            </Link>
            <Link className="studio-text-link" href={`/${locale}`} rel="noreferrer" target="_blank">
              {messages.studio.openSite}
              <ExternalLink aria-hidden="true" size={14} />
            </Link>
            <Link className="studio-button studio-button--primary studio-topbar__create" href={`/${locale}/studio/articles/new`}>
              <Plus aria-hidden="true" size={17} />
              {messages.studio.newArticle}
            </Link>
            <form action={signOutAction} className="studio-topbar__logout">
              <input name="locale" type="hidden" value={locale} />
              <button className="studio-icon-button" title={messages.auth.signOut} type="submit">
                <LogOut aria-hidden="true" size={16} />
                <span className="sr-only">{messages.auth.signOut}</span>
              </button>
            </form>
          </div>
        </header>
        <main className="studio-main" id="studio-main">
          {children}
        </main>
      </div>
    </div>
  );
}
