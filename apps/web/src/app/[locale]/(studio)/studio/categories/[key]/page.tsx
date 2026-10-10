import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CategoryRecord } from "@atlasnews/core/editorial/domain/category";
import { runCategoryCapability } from "@/components/studio/categories/category-data";
import { CategoryForm } from "@/components/studio/categories/category-form";
import { isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";

export const metadata: Metadata = { robots: { index: false } };

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ locale: string; key: string }>;
}) {
  const { locale, key } = await params;
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  const loaded = await runCategoryCapability(locale, "admin_get_category", { translationKey: key });
  if (!loaded.ok) {
    if (loaded.status === 400) notFound();
    throw new Error(loaded.error);
  }
  return <CategoryForm category={(loaded.result as { category: CategoryRecord }).category} locale={locale} />;
}
