import Link from "next/link";
import { ExternalLink, LogOut } from "lucide-react";
import type { Locale, Messages } from "@/i18n";
import type { EditorIdentity } from "@/lib/editor-identity";
import { signOutAction } from "@/app/[locale]/(studio)/login/actions";
import { StudioBrand } from "./studio-brand";
import { StudioNavigation } from "./studio-navigation";
import { StudioSidebar } from "./studio-sidebar";

export function StudioShell({
  children,
  locale,
  messages,
  editor,
  signOutPath,
}: {
  children: React.ReactNode;
  locale: Locale;
  messages: Messages;
  editor: EditorIdentity;
  /** On Sites a plain form POST to the sign-out path of whatever signed the editor in (ChatGPT's or ours). Otherwise the Supabase action. */
  signOutPath?: string;
}) {
  const alternateLocale = locale === "en" ? "it" : "en";

  return (
    <div className="studio-shell">
      <StudioSidebar
        brand={<StudioBrand href={`/${locale}/studio`} label="Studio" name={messages.common.brandName} />}
        label={messages.studio.navigationLabel}
      >
        <StudioNavigation copy={messages.studio} isAdmin={editor.role === "admin"} locale={locale} />

        <div className="studio-user">
          <span className="studio-user__avatar" aria-hidden="true">
            {editor.author.initials}
          </span>
          <span className="studio-user__name">
            <strong>{editor.author.name}</strong>
            <small>{editor.role}</small>
          </span>
          <form
            action={signOutPath ?? signOutAction}
            method={signOutPath ? "post" : undefined}
            target={signOutPath ? "_top" : undefined}
          >
            <input name="locale" type="hidden" value={locale} />
            <button className="studio-icon-button" title={messages.auth.signOut} type="submit">
              <LogOut aria-hidden="true" />
              <span className="sr-only">{messages.auth.signOut}</span>
            </button>
          </form>
        </div>
      </StudioSidebar>

      <div className="studio-workspace">
        <header className="studio-topbar">
          {editor.isDemo ? <span className="studio-mode">{messages.studio.demoMode}</span> : <span />}
          <div className="studio-topbar__links">
            <Link
              aria-label={locale === "en" ? "Passa all’italiano" : "Switch to English"}
              className="studio-link"
              href={`/${alternateLocale}/studio`}
              hrefLang={alternateLocale}
            >
              {alternateLocale.toUpperCase()}
            </Link>
            <Link className="studio-link" href={`/${locale}`} rel="noreferrer" target="_blank">
              {messages.studio.openSite}
              <ExternalLink aria-hidden="true" size={14} />
            </Link>
          </div>
        </header>
        <main className="studio-main" id="studio-main">
          {children}
        </main>
      </div>
    </div>
  );
}
