import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listEntityItems } from "@/components/studio/entities/entity-data";
import { EntityForm } from "@/components/studio/entities/entity-form";
import { isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";

export const metadata: Metadata = { robots: { index: false } };

export default async function NewEntityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  const companies = await listEntityItems(locale, "company");
  if (!companies.ok) throw new Error(companies.error);

  return <EntityForm companies={companies.items} locale={locale} />;
}
