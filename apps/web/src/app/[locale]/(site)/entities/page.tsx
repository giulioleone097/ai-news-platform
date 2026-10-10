import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAlternates, getMessages, isLocale, localizedPath } from "@/i18n";
import { getCachedEntities } from "@/lib/editorial-queries";
import { entityKinds } from "@atlasnews/core/editorial/domain/entity";

export const revalidate = 60;

// Products first: they are what readers look for.
const kindOrder = [...entityKinds].reverse();

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const messages = getMessages(locale);
  return {
    title: messages.metadata.entitiesTitle,
    description: messages.metadata.entitiesDescription,
    alternates: getAlternates("/entities", locale),
  };
}

export default async function EntitiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const messages = getMessages(locale);
  const copy = messages.entities;
  const entities = await getCachedEntities(locale);

  return (
    <main id="main-content" className="site-shell entity-index">
      <header className="page-head">
        <h1>{copy.indexTitle}</h1>
        <p>{copy.indexDescription}</p>
      </header>

      {entities.length ? (
        kindOrder.map((kind) => {
          const group = entities.filter((entity) => entity.kind === kind);
          if (!group.length) return null;
          return (
            <section className="entity-group" aria-labelledby={`kind-${kind}`} key={kind}>
              <h2 id={`kind-${kind}`}>{copy.kindPlural[kind]}</h2>
              <ul className="entity-grid">
                {group.map((entity) => (
                  <li className="entity-card" key={entity.slug}>
                    <h3>
                      <Link href={localizedPath(`/entities/${entity.slug}`, locale)} prefetch={false}>
                        {entity.name}
                      </Link>
                    </h3>
                    {entity.parent ? <p className="entity-card__parent">{copy.madeBy} {entity.parent.name}</p> : null}
                    {entity.description ? <p>{entity.description}</p> : null}
                    <p className="entity-card__count">
                      {entity.storyCount} {entity.storyCount === 1 ? copy.storyOne : copy.storyMany}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      ) : (
        <div className="empty-state">
          <h2>{copy.indexEmptyTitle}</h2>
          <p>{copy.indexEmptyDescription}</p>
          <Link className="button" href={localizedPath("/latest", locale)}>{copy.seeLatest}</Link>
        </div>
      )}
    </main>
  );
}
