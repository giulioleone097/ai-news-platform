import { notFound } from "next/navigation";
import "./studio.css";
import { StudioSiteTools } from "@/components/studio/site-tools/studio-site-tools";
import { StudioShell } from "@/components/studio/studio-shell";
import { getMessages, isLocale } from "@/i18n";
import { getContentMode } from "@atlasnews/adapters/config/env";
import { requireEditor } from "@/lib/editor-auth";
import { chatGPTSignOutPath } from "@/lib/sites/editor-auth";

export const dynamic = "force-dynamic";

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

  return (
    <StudioShell
      editor={editor}
      locale={locale}
      messages={messages}
      signOutPath={getContentMode() === "sites" ? chatGPTSignOutPath(`/${locale}`) : undefined}
    >
      {children}
      <StudioSiteTools locale={locale} />
    </StudioShell>
  );
}
