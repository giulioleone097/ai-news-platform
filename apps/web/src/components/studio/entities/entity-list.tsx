import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import type { Locale } from "@/i18n";
import { entityKinds } from "@atlasnews/core/editorial/domain/entity";
import { entityCopy } from "@/app/[locale]/(studio)/studio/entities/copy";
import type { EntityListItem } from "./entity-data";

export function EntityList({ items, locale }: { items: EntityListItem[]; locale: Locale }) {
  const copy = entityCopy[locale];

  if (!items.length) {
    return (
      <div className="empty-state">
        <h2>{copy.emptyTitle}</h2>
        <p>{copy.emptyDescription}</p>
        <Link className="button button--primary" href={`/${locale}/studio/entities/new`}>
          <Plus aria-hidden="true" />
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
          <section aria-labelledby={headingId} className="studio-stack" key={kind}>
            <h2 className="studio-section__title" id={headingId}>{copy.kindGroups[kind]}</h2>
            <div className="studio-table-wrap">
              <table className="studio-table studio-table--fixed">
                <colgroup>
                  <col className="studio-col--name" />
                  <col className="studio-col--slug" />
                  <col className="studio-col--parent" />
                  <col className="studio-col--count" />
                  <col className="studio-col--actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{copy.name}</th>
                    <th>{copy.slug}</th>
                    <th>{copy.parent}</th>
                    <th className="studio-num">{copy.stories}</th>
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
                        <td className="studio-table__main">
                          <Link className="studio-cell" href={href}>
                            <strong>{item.name}</strong>
                          </Link>
                        </td>
                        <td data-label={copy.slug}>{item.slug}</td>
                        <td data-label={copy.parent}>{item.parent?.name ?? "—"}</td>
                        <td className="studio-num" data-label={copy.stories}>{item.storyCount || null}</td>
                        <td className="studio-table__actions">
                          <div className="studio-actions">
                            <Link aria-label={`${copy.edit}: ${item.name}`} className="studio-icon-button" href={href}>
                              <Pencil aria-hidden="true" />
                            </Link>
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
