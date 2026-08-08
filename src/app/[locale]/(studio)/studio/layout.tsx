import { notFound } from "next/navigation";
import { StudioShell } from "@/components/studio/studio-shell";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";

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
    <StudioShell editor={editor} locale={locale} messages={messages}>
      {children}
    </StudioShell>
  );
}
