import Link from "next/link";
import type { CategoryRecord } from "@atlasnews/core/editorial/domain/category";
import type { Locale } from "@/i18n";
import { categoryCopy } from "@/app/[locale]/(studio)/studio/categories/copy";
import { DeleteCategoryButton } from "./delete-category-button";
import styles from "./categories.module.css";

export function CategoryList({ categories, locale }: { categories: CategoryRecord[]; locale: Locale }) {
  const copy = categoryCopy[locale];

  return (
    <div className="studio-table-wrap">
      <table className="studio-table">
        <thead>
          <tr>
            <th>{copy.english}</th>
            <th>{copy.italian}</th>
            <th>{copy.position}</th>
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
                <td data-label={copy.english}>
                  <span className={styles.names}>
                    <strong>{english?.name ?? "—"}</strong>
                    <span>/{english?.slug ?? "—"}</span>
                  </span>
                </td>
                <td data-label={copy.italian}>
                  <span className={styles.names}>
                    <strong>{italian?.name ?? "—"}</strong>
                    <span>/{italian?.slug ?? "—"}</span>
                  </span>
                </td>
                <td data-label={copy.position}>{category.position}</td>
                <td>
                  <span className={styles.rowActions}>
                    <Link
                      aria-label={`${copy.editCategory}: ${name}`}
                      className="studio-button studio-button--secondary"
                      href={`/${locale}/studio/categories/${encodeURIComponent(category.translationKey)}`}
                    >
                      {copy.edit}
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
