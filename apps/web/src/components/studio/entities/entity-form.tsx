"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { Locale } from "@/i18n";
import {
  entityKinds,
  entityLimits,
  type EntityKind,
  type EntityRecord,
} from "@atlasnews/core/editorial/domain/entity";
import {
  saveEntityAction,
  type EntityFormState,
  type EntityFormValues,
} from "@/app/[locale]/(studio)/studio/entities/actions";
import { entityCopy } from "@/app/[locale]/(studio)/studio/entities/copy";
import { StudioSubmitButton } from "@/components/studio/studio-submit-button";

function valuesOf(entity?: EntityRecord): EntityFormValues {
  return {
    name: entity?.name ?? "",
    kind: entity?.kind ?? entityKinds[0],
    parentSlug: entity?.parent?.slug ?? "",
    officialUrl: entity?.officialUrl ?? "",
    descriptionEn: entity?.descriptions.en ?? "",
    descriptionIt: entity?.descriptions.it ?? "",
  };
}

export function EntityForm({
  locale,
  companies,
  entity,
}: {
  locale: Locale;
  companies: { slug: string; name: string }[];
  entity?: EntityRecord;
}) {
  const copy = entityCopy[locale];
  const [state, formAction] = useActionState<EntityFormState, FormData>(saveEntityAction, { status: "idle" });
  // After a refusal the form is re-keyed and rendered again with what the person typed as its defaults.
  const values = state.values ?? valuesOf(entity);
  const [kind, setKind] = useState<EntityKind>(values.kind as EntityKind);

  return (
    <form action={formAction} className="studio-editor" key={state.attempt ?? 0} noValidate>
      <input name="locale" type="hidden" value={locale} />
      {entity ? <input name="slug" type="hidden" value={entity.slug} /> : null}

      <header className="studio-page-header studio-editor__header">
        <div>
          <Link className="studio-back-link" href={`/${locale}/studio/entities`}>
            <ChevronLeft aria-hidden="true" size={16} />
            {copy.backToList}
          </Link>
          <p className="studio-kicker">{entity ? copy.editKicker : copy.createKicker}</p>
          <h1>{entity?.name ?? copy.newEntity}</h1>
        </div>
        <div className="studio-editor__actions">
          <Link className="studio-button studio-button--secondary" href={`/${locale}/studio/entities`}>
            {copy.cancel}
          </Link>
          <StudioSubmitButton idleLabel={copy.save} pendingLabel={copy.saving} />
        </div>
      </header>

      {state.status === "error" && state.message ? (
        <p className="studio-alert studio-alert--error" role="alert" aria-atomic="true">
          {state.message}
        </p>
      ) : null}

      <section className="studio-panel" aria-labelledby="entity-details-title">
        <div className="studio-panel__heading">
          <span>01</span>
          <h2 id="entity-details-title">{copy.detailsTitle}</h2>
        </div>

        <label className="studio-field">
          <span>{copy.nameLabel}</span>
          <input defaultValue={values.name} maxLength={entityLimits.name.max} name="name" required />
        </label>

        <label className="studio-field">
          <span>{copy.kindLabel}</span>
          <select
            defaultValue={values.kind}
            name="kind"
            onChange={(event) => setKind(event.target.value as EntityKind)}
          >
            {entityKinds.map((option) => (
              <option key={option} value={option}>{copy.kindLabels[option]}</option>
            ))}
          </select>
        </label>

        {kind !== "company" ? (
          <label className="studio-field">
            <span>{copy.parentLabel}</span>
            <select defaultValue={values.parentSlug} name="parentSlug">
              <option value="">{copy.noParent}</option>
              {companies.map((company) => (
                <option key={company.slug} value={company.slug}>{company.name}</option>
              ))}
            </select>
            <small>{companies.length ? copy.parentHelp : copy.noCompanies}</small>
          </label>
        ) : null}

        {entity ? (
          <label className="studio-field">
            <span>{copy.slugLabel}</span>
            <input aria-describedby="entity-slug-help" defaultValue={entity.slug} readOnly />
            <small id="entity-slug-help">{copy.slugFixed}</small>
          </label>
        ) : (
          <p className="studio-field">
            <span>{copy.slugLabel}</span>
            <small>{copy.slugNew}</small>
          </p>
        )}

        <label className="studio-field">
          <span>{copy.officialUrlLabel}</span>
          <input
            defaultValue={values.officialUrl}
            maxLength={entityLimits.officialUrl.max}
            name="officialUrl"
            type="url"
          />
          <small>{copy.officialUrlHelp}</small>
        </label>

        <label className="studio-field">
          <span>{copy.descriptionEnLabel}</span>
          <input defaultValue={values.descriptionEn} maxLength={entityLimits.description.max} name="descriptionEn" />
          <small>{copy.descriptionHelp}</small>
        </label>

        <label className="studio-field">
          <span>{copy.descriptionItLabel}</span>
          <input defaultValue={values.descriptionIt} maxLength={entityLimits.description.max} name="descriptionIt" />
          <small>{copy.descriptionHelp}</small>
        </label>
      </section>
    </form>
  );
}
