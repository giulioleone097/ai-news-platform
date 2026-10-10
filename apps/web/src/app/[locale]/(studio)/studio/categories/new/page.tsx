import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryForm } from "@/components/studio/categories/category-form";
import { isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";

export const metadata: Metadata = { robots: { index: false } };

export default async function NewCategoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  return <CategoryForm locale={locale} />;
}
