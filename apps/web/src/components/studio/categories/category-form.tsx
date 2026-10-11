"use client";

import Link from "next/link";
import { useActionState } from "react";
import { categoryLimits, type CategoryRecord } from "@atlasnews/core/editorial/domain/category";
import type { Locale } from "@/i18n";
import { saveCategoryAction } from "@/app/[locale]/(studio)/studio/categories/actions";
import { categoryCopy, type CategoryCopy } from "@/app/[locale]/(studio)/studio/categories/copy";
import { Note } from "@/components/studio/note";
import { PageHead } from "@/components/studio/page-head";
import { StudioSubmitButton } from "@/components/studio/studio-submit-button";
import { categoryFormValues, idleCategoryActionState, type CategoryTextValues } from "./category-form-state";

function LocaleFields({
  copy,
  editing,
  label,
  language,
  values,
}: {
  copy: CategoryCopy;
  editing: boolean;
  label: string;
  language: Locale;
  values: CategoryTextValues;
}) {
  return (
    <fieldset className="studio-section">
      <legend>{label}</legend>
      <label className="studio-field">
        <span>{copy.name}</span>
        <input defaultValue={values.name} maxLength={categoryLimits.name.max} name={`${language}.name`} required />
      </label>
      <label className="studio-field">
        <span>{copy.slug}</span>
        <input
          defaultValue={values.slug}
          maxLength={categoryLimits.slug.max}
          name={`${language}.slug`}
          placeholder={editing ? undefined : copy.slugPlaceholder}
        />
        {editing ? <small>{copy.slugKeepHelp}</small> : null}
      </label>
      <label className="studio-field">
        <span>{copy.description}</span>
        <textarea
          defaultValue={values.description}
          maxLength={categoryLimits.description.max}
          name={`${language}.description`}
          rows={3}
        />
      </label>
    </fieldset>
  );
}

export function CategoryForm({ locale, category }: { locale: Locale; category?: CategoryRecord }) {
  const [state, formAction] = useActionState(saveCategoryAction, idleCategoryActionState);
  const values = state.values ?? categoryFormValues(category);
  const copy = categoryCopy[locale];
  const editing = Boolean(category);
  const listHref = `/${locale}/studio/categories`;

  return (
    <form action={formAction} className="studio-editor" noValidate>
      {category ? <input name="translationKey" type="hidden" value={category.translationKey} /> : null}
      <input name="locale" type="hidden" value={locale} />

      <PageHead back={{ href: listHref, label: copy.listTitle }} title={category?.translations.en?.name ?? copy.newCategory}>
        <Link className="button button--quiet" href={listHref}>{copy.cancel}</Link>
        <StudioSubmitButton idleLabel={copy.save} pendingLabel={copy.saving} />
      </PageHead>

      {state.status === "error" && state.message ? <Note tone="error">{state.message}</Note> : null}

      <div className="studio-columns">
        <LocaleFields copy={copy} editing={editing} label={copy.english} language="en" values={values.en} />
        <LocaleFields copy={copy} editing={editing} label={copy.italian} language="it" values={values.it} />
      </div>

      <label className="studio-field studio-form-width">
        <span>{copy.position}</span>
        <input
          defaultValue={values.position}
          inputMode="numeric"
          max={categoryLimits.position.max}
          min={0}
          name="position"
          step={1}
          type="number"
        />
        <small>{copy.positionHelp}</small>
      </label>
    </form>
  );
}
