import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listEntityItems } from "@/components/studio/entities/entity-data";
import { EntityDeleteButton } from "@/components/studio/entities/entity-delete-button";
import { EntityForm } from "@/components/studio/entities/entity-form";
import { isLocale } from "@/i18n";
import type { EntityRecord } from "@atlasnews/core/editorial/domain/entity";
import { requireEditor } from "@/lib/editor-auth";
import { runStudioCapability } from "@/server/studio-capability";
import { entityCopy } from "../copy";

export const metadata: Metadata = { robots: { index: false } };

export default async function EditEntityPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  const [entity, companies] = await Promise.all([
    runStudioCapability(locale, "admin_get_entity", { slug }),
    listEntityItems(locale, "company"),
  ]);
  if (!entity.ok) {
    // A slug that names no entity is refused as a not-found entity.
    if (entity.code === "entity.notFound") notFound();
    throw new Error(entity.error);
  }
  if (!companies.ok) throw new Error(companies.error);

  const record = (entity.result as { entity: EntityRecord }).entity;
  const copy = entityCopy[locale];

  return (
    <>
      <EntityForm companies={companies.items} entity={record} locale={locale} />
      <section className="studio-section studio-form-width" aria-labelledby="entity-delete-title">
        <h2 className="studio-section__title" id="entity-delete-title">{copy.deleteTitle}</h2>
        <p className="studio-muted">{copy.deleteHelp}</p>
        <div>
          <EntityDeleteButton locale={locale} name={record.name} slug={record.slug} />
        </div>
      </section>
    </>
  );
}
