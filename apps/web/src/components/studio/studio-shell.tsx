import Link from "next/link";
import { Bot, ExternalLink, LogOut } from "lucide-react";
import type { Locale, Messages } from "@/i18n";
import type { EditorIdentity } from "@/lib/editor-identity";
import { signOutAction } from "@/app/[locale]/(studio)/login/actions";
import { StudioBrand } from "./studio-brand";
import { StudioLanguage } from "./studio-language";
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
  const { studio } = messages;
  const demoPill = editor.isDemo ? (
    <span className="studio-mode" title={studio.demoModeHint}>
      {studio.demoMode}
    </span>
  ) : null;
  // Shown once the page has registered the Studio's tools with the browser's agent (see StudioSiteTools).
  const agentStatus = (
    <span className="studio-agent" title={studio.agentToolsHint}>
      <Bot aria-hidden="true" />
      {studio.agentTools}
    </span>
  );
  const openSite = (
    <Link className="studio-link" href={`/${locale}`} rel="noreferrer" target="_blank">
      {studio.openSite}
      <ExternalLink aria-hidden="true" />
    </Link>
  );

  return (
    <div className="studio-shell">
      <a className="skip-link" href="#studio-main">{messages.navigation.skipToContent}</a>
      <StudioSidebar
        brand={<StudioBrand href={`/${locale}/studio`} label="Studio" name={messages.common.brandName} />}
        label={studio.navigationLabel}
        status={demoPill}
      >
        <StudioNavigation copy={studio} isAdmin={editor.role === "admin"} locale={locale} />

        <div className="studio-sidebar__tools">
          <StudioLanguage label={studio.language} locale={locale} />
          {openSite}
          {agentStatus}
        </div>

        <div className="studio-user">
          <span className="studio-user__avatar" aria-hidden="true">
            {editor.author.initials}
          </span>
          <span className="studio-user__name">
            <strong>{editor.author.name}</strong>
            <small>{editor.role === "admin" ? studio.roleAdmin : studio.roleEditor}</small>
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
          <div className="studio-topbar__status">
            {demoPill}
            {agentStatus}
          </div>
          <div className="studio-topbar__links">
            <StudioLanguage label={studio.language} locale={locale} />
            {openSite}
          </div>
        </header>
        <main className="studio-main" id="studio-main">
          {children}
        </main>
      </div>
    </div>
  );
}
