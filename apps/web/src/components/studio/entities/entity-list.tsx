import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import type { Locale } from "@/i18n";
import { entityKinds } from "@atlasnews/core/editorial/domain/entity";
import { entityCopy } from "@/app/[locale]/(studio)/studio/entities/copy";
import type { EntityListItem } from "./entity-data";
import { EntityDeleteButton } from "./entity-delete-button";
import styles from "./entities.module.css";

export function EntityList({ items, locale }: { items: EntityListItem[]; locale: Locale }) {
  const copy = entityCopy[locale];

  if (!items.length) {
    return (
      <div className="studio-empty-state">
        <span>00</span>
        <h2>{copy.emptyTitle}</h2>
        <p>{copy.emptyDescription}</p>
        <Link className="studio-button studio-button--primary" href={`/${locale}/studio/entities/new`}>
          <Plus aria-hidden="true" size={17} />
          {copy.newEntity}
        </Link>
      </div>
    );
  }

  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, locale));

  return (
    <>
      {entityKinds.map((kind) => {
        const group = sorted.filter((item) => item.kind === kind);
        if (!group.length) return null;
        const headingId = `entities-${kind}`;

        return (
          <section aria-labelledby={headingId} className="studio-section" key={kind}>
            <div className="studio-section__header">
              <div>
                <h2 id={headingId}>{copy.kindGroups[kind]}</h2>
              </div>
            </div>
            <div className="studio-table-wrap">
              <table className="studio-table">
                <thead>
                  <tr>
                    <th>{copy.name}</th>
                    <th>{copy.slug}</th>
                    <th>{copy.parent}</th>
                    <th>{copy.stories}</th>
                    <th>
                      <span className="sr-only">{copy.actions}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.map((item) => {
                    const href = `/${locale}/studio/entities/${item.slug}`;
                    return (
                      <tr key={item.slug}>
                        <td>
                          <Link className="studio-table__title" href={href}>
                            <strong>{item.name}</strong>
                          </Link>
                        </td>
                        <td data-label={copy.slug}>{item.slug}</td>
                        <td data-label={copy.parent}>{item.parent?.name ?? "—"}</td>
                        <td data-label={copy.stories}>{item.storyCount}</td>
                        <td>
                          <div className={`studio-row-actions ${styles.rowActions}`}>
                            <Link aria-label={`${copy.edit}: ${item.name}`} className={styles.action} href={href}>
                              <Pencil aria-hidden="true" size={16} />
                            </Link>
                            <EntityDeleteButton locale={locale} slug={item.slug} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}
