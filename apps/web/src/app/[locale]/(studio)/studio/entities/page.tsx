import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { listEntityItems } from "@/components/studio/entities/entity-data";
import { EntityList } from "@/components/studio/entities/entity-list";
import { isLocale } from "@/i18n";
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
      <header className="studio-page-header">
        <div>
          <p className="studio-kicker">{copy.kicker}</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        <Link className="studio-button studio-button--primary" href={`/${locale}/studio/entities/new`}>
          <Plus aria-hidden="true" size={17} />
          {copy.newEntity}
        </Link>
      </header>

      {saved ? <p className="studio-alert studio-alert--success" role="status">{saved}</p> : null}
      {query.deleted ? <p className="studio-alert studio-alert--success" role="status">{copy.deleted}</p> : null}

      {listed.ok ? (
        <EntityList items={listed.items} locale={locale} />
      ) : (
        <p className="studio-alert studio-alert--error" role="alert">{copy.loadError}</p>
      )}
    </>
  );
}
