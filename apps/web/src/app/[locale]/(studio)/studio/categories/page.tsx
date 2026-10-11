import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { listCategoryRows } from "@/components/studio/categories/category-data";
import { CategoryList } from "@/components/studio/categories/category-list";
import { Note } from "@/components/studio/note";
import { PageHead } from "@/components/studio/page-head";
import { isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { categoryCopy } from "./copy";

export const metadata: Metadata = { robots: { index: false } };

export default async function StudioCategoriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; deleted?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  const categories = await listCategoryRows(locale);
  const copy = categoryCopy[locale];
  const newHref = `/${locale}/studio/categories/new`;

  return (
    <>
      <PageHead description={copy.listDescription} title={copy.listTitle}>
        <Link className="button button--primary" href={newHref}>
          <Plus aria-hidden="true" />
          {copy.newCategory}
        </Link>
      </PageHead>

      {query.saved ? <Note tone="success">{copy.saved}</Note> : query.deleted ? <Note tone="success">{copy.deleted}</Note> : null}

      {categories.length ? (
        <CategoryList categories={categories} locale={locale} />
      ) : (
        <div className="empty-state">
          <h2>{copy.emptyTitle}</h2>
          <p>{copy.emptyDescription}</p>
          <Link className="button button--primary" href={newHref}>{copy.newCategory}</Link>
        </div>
      )}
    </>
  );
}
