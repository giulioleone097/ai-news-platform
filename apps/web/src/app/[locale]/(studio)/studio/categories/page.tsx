import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { listCategoryRows } from "@/components/studio/categories/category-data";
import { CategoryList } from "@/components/studio/categories/category-list";
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
      <header className="studio-page-header">
        <div>
          <p className="studio-kicker">{copy.listKicker}</p>
          <h1>{copy.listTitle}</h1>
          <p>{copy.listDescription}</p>
        </div>
        <Link className="studio-button studio-button--primary" href={newHref}>
          <Plus aria-hidden="true" size={17} />
          {copy.newCategory}
        </Link>
      </header>

      {query.saved ? (
        <p className="studio-alert studio-alert--success" role="status">{copy.saved}</p>
      ) : query.deleted ? (
        <p className="studio-alert studio-alert--success" role="status">{copy.deleted}</p>
      ) : null}

      <section className="studio-section" aria-label={copy.listTitle}>
        {categories.length ? (
          <CategoryList categories={categories} locale={locale} />
        ) : (
          <div className="studio-empty-state">
            <span>00</span>
            <h2>{copy.emptyTitle}</h2>
            <p>{copy.emptyDescription}</p>
            <Link className="studio-button studio-button--primary" href={newHref}>{copy.newCategory}</Link>
          </div>
        )}
      </section>
    </>
  );
}
