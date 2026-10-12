import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "./studio.css";
import { StudioSiteTools } from "@/components/studio/site-tools/studio-site-tools";
import { StudioShell } from "@/components/studio/studio-shell";
import { getMessages, isLocale } from "@/i18n";
import { getContentMode } from "@atlasnews/adapters/config/env";
import { signOutPath } from "@/lib/auth/paths";
import { getSignedInUser, requireEditor } from "@/lib/editor-auth";

export const dynamic = "force-dynamic";

// Every Studio page, whatever it sets for itself, is kept out of search results.
export const metadata: Metadata = { robots: { index: false } };

export default async function StudioLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const editor = await requireEditor(locale);
  const messages = getMessages(locale);
  // On Sites the sign-out is a form POST to the path of whatever signed the editor in: the platform for
  // ChatGPT, ours for Google and GitHub. Elsewhere the shell uses the Supabase action.
  const user = getContentMode() === "sites" ? await getSignedInUser() : null;

  return (
    <StudioShell
      editor={editor}
      locale={locale}
      messages={messages}
      signOutPath={user ? signOutPath(user.provider, `/${locale}`) : undefined}
    >
      {children}
      <StudioSiteTools />
    </StudioShell>
  );
}
