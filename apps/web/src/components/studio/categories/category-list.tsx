import Link from "next/link";
import { Pencil } from "lucide-react";
import type { CategoryRecord } from "@atlasnews/core/editorial/domain/category";
import type { Locale } from "@/i18n";
import { categoryCopy } from "@/app/[locale]/(studio)/studio/categories/copy";
import { DeleteCategoryButton } from "./delete-category-button";

export function CategoryList({ categories, locale }: { categories: CategoryRecord[]; locale: Locale }) {
  const copy = categoryCopy[locale];
  const editHref = (key: string) => `/${locale}/studio/categories/${encodeURIComponent(key)}`;

  return (
    <div className="studio-table-wrap">
      <table className="studio-table">
        <thead>
          <tr>
            <th>{copy.english}</th>
            <th>{copy.italian}</th>
            <th className="studio-num">{copy.position}</th>
            <th>
              <span className="sr-only">{copy.actions}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => {
            const english = category.translations.en;
            const italian = category.translations.it;
            const name = english?.name ?? category.translationKey;
            return (
              <tr key={category.translationKey}>
                <td className="studio-table__main">
                  <Link className="studio-cell" href={editHref(category.translationKey)}>
                    <strong>{english?.name ?? "—"}</strong>
                    <small>/{english?.slug ?? "—"}</small>
                  </Link>
                </td>
                <td data-label={copy.italian}>
                  <span className="studio-cell">
                    <strong>{italian?.name ?? "—"}</strong>
                    <small>/{italian?.slug ?? "—"}</small>
                  </span>
                </td>
                <td className="studio-num" data-label={copy.position}>{category.position}</td>
                <td className="studio-table__actions">
                  <span className="studio-actions">
                    <Link
                      aria-label={`${copy.editCategory}: ${name}`}
                      className="studio-icon-button"
                      href={editHref(category.translationKey)}
                    >
                      <Pencil aria-hidden="true" />
                    </Link>
                    <DeleteCategoryButton locale={locale} name={name} translationKey={category.translationKey} />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
