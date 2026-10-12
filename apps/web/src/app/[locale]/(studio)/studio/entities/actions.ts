"use server";

import { redirect } from "next/navigation";
import type { StudioActionState } from "@/components/studio/action-state";
import type { Locale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import type { EntityRecord } from "@atlasnews/core/editorial/domain/entity";
import type { CapabilityRunResult } from "@/server/capabilities";
import { readLocale, runStudioCapability } from "@/server/studio-capability";

/** The entity form as the person typed it. Blank optional fields are empty strings. */
export interface EntityFormValues {
  name: string;
  kind: string;
  parentSlug: string;
  officialUrl: string;
  descriptionEn: string;
  descriptionIt: string;
}

export interface EntityFormState extends StudioActionState {
  /** What the person typed, kept after a refusal so the form shows it again. */
  values?: EntityFormValues;
  /** Counts refusals; the form is re-keyed on it, so the typed values come back as its defaults. */
  attempt?: number;
}

type Refusal = Extract<CapabilityRunResult, { ok: false }>;

function readValues(formData: FormData): EntityFormValues {
  const text = (name: string) => String(formData.get(name) ?? "");
  return {
    name: text("name"),
    kind: text("kind"),
    parentSlug: text("parentSlug"),
    officialUrl: text("officialUrl"),
    descriptionEn: text("descriptionEn"),
    descriptionIt: text("descriptionIt"),
  };
}

function descriptionText(values: EntityFormValues) {
  return { en: values.descriptionEn.trim(), it: values.descriptionIt.trim() };
}

/** A new entity sends only the fields that have a value; the capability derives the slug from the name. */
function createInput(values: EntityFormValues) {
  const input: Record<string, unknown> = { kind: values.kind, name: values.name.trim() };
  const officialUrl = values.officialUrl.trim();
  if (officialUrl) input.officialUrl = officialUrl;
  const parentSlug = values.parentSlug.trim();
  if (parentSlug && values.kind !== "company") input.parentSlug = parentSlug;
  const descriptions = Object.fromEntries(
    Object.entries(descriptionText(values)).filter(([, text]) => text),
  );
  if (Object.keys(descriptions).length) input.descriptions = descriptions;
  return input;
}

/** An edit sends only the fields that differ from the stored entity; a cleared field is sent as null. */
function patchFor(slug: string, current: EntityRecord, values: EntityFormValues) {
  const patch: Record<string, unknown> = { slug };
  const name = values.name.trim();
  if (name !== current.name) patch.name = name;
  if (values.kind !== current.kind) patch.kind = values.kind;
  const officialUrl = values.officialUrl.trim();
  if (officialUrl !== (current.officialUrl ?? "")) patch.officialUrl = officialUrl || null;
  const parentSlug = values.kind === "company" ? "" : values.parentSlug.trim();
  if (parentSlug !== (current.parent?.slug ?? "")) patch.parentSlug = parentSlug || null;
  const typed = descriptionText(values);
  const descriptions: Record<string, string | null> = {};
  for (const locale of ["en", "it"] as const) {
    if (typed[locale] !== (current.descriptions[locale] ?? "")) descriptions[locale] = typed[locale] || null;
  }
  if (Object.keys(descriptions).length) patch.descriptions = descriptions;
  return patch;
}

async function updateEntity(locale: Locale, slug: string, values: EntityFormValues): Promise<CapabilityRunResult> {
  const current = await runStudioCapability(locale, "admin_get_entity", { slug });
  if (!current.ok) return current;
  const patch = patchFor(slug, (current.result as { entity: EntityRecord }).entity, values);
  if (Object.keys(patch).length === 1) return { ok: true, result: {} };
  return runStudioCapability(locale, "admin_update_entity", patch);
}

/** The refusal as the form shows it, already in the editor's language. */
function refusal(failure: Refusal): StudioActionState {
  return { status: "error", message: failure.error };
}

export async function saveEntityAction(
  previous: EntityFormState,
  formData: FormData,
): Promise<EntityFormState> {
  const locale = readLocale(formData);
  const slug = String(formData.get("slug") ?? "");
  const values = readValues(formData);
  await requireEditor(locale);

  const result = slug
    ? await updateEntity(locale, slug, values)
    : await runStudioCapability(locale, "admin_create_entity", createInput(values));
  if (!result.ok) {
    return { ...refusal(result), values, attempt: (previous.attempt ?? 0) + 1 };
  }

  redirect(`/${locale}/studio/entities?saved=${slug ? "updated" : "created"}`);
}

export async function deleteEntityAction(
  _previousState: EntityFormState,
  formData: FormData,
): Promise<EntityFormState> {
  const locale = readLocale(formData);
  const slug = String(formData.get("slug") ?? "");
  await requireEditor(locale);

  // The person confirmed this deletion in the page (window.confirm) before the form was sent.
  const result = await runStudioCapability(locale, "admin_delete_entity", { slug }, { confirmed: true });
  if (!result.ok) return refusal(result);

  redirect(`/${locale}/studio/entities?deleted=1`);
}
