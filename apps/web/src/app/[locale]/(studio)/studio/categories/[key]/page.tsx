import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CategoryRecord } from "@atlasnews/core/editorial/domain/category";
import { CategoryForm } from "@/components/studio/categories/category-form";
import { isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { runStudioCapability } from "@/server/studio-capability";

export const metadata: Metadata = { robots: { index: false } };

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ locale: string; key: string }>;
}) {
  const { locale, key } = await params;
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  const loaded = await runStudioCapability(locale, "admin_get_category", { translationKey: key });
  if (!loaded.ok) {
    if (loaded.status === 400) notFound();
    throw new Error(loaded.error);
  }
  return <CategoryForm category={(loaded.result as { category: CategoryRecord }).category} locale={locale} />;
}
