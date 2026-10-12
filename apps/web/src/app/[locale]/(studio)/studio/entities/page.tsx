import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { listEntityItems } from "@/components/studio/entities/entity-data";
import { EntityList } from "@/components/studio/entities/entity-list";
import { Note } from "@/components/studio/note";
import { PageHead } from "@/components/studio/page-head";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { entityCopy } from "./copy";

export const metadata: Metadata = { robots: { index: false } };

export default async function StudioEntitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; deleted?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  const listed = await listEntityItems(locale);
  if (!listed.ok && listed.status === 401) redirect(`/${locale}/login`);
  const copy = entityCopy[locale];
  const saved = query.saved === "created" || query.saved === "updated" ? copy.saved[query.saved] : null;

  return (
    <>
      <PageHead description={copy.description} title={getMessages(locale).studio.entities}>
        <Link className="button button--primary" href={`/${locale}/studio/entities/new`}>
          <Plus aria-hidden="true" />
          {copy.newEntity}
        </Link>
      </PageHead>

      {saved ? <Note tone="success">{saved}</Note> : null}
      {query.deleted ? <Note tone="success">{copy.deleted}</Note> : null}

      {listed.ok ? (
        <EntityList items={listed.items} locale={locale} />
      ) : (
        <Note tone="error">{copy.loadError}</Note>
      )}
    </>
  );
}
