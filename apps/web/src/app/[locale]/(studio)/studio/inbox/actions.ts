"use server";

import { redirect } from "next/navigation";
import * as z from "zod/v4";
import type { StudioActionState } from "@/components/studio/action-state";
import { defaultLocale, isLocale, type Locale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { runEditorCapability } from "@/server/capabilities";
import { inboxCopy } from "./copy";

function readLocale(formData: FormData): Locale {
  const value = formData.get("locale");
  return isLocale(value) ? value : defaultLocale;
}

/** The inbox address that keeps the status filter the editor was looking at. */
function inboxPath(locale: Locale, formData: FormData, flag: string) {
  const filter = z.enum(["new", "handled", "archived"]).safeParse(formData.get("filter"));
  const params = new URLSearchParams(filter.success ? { status: filter.data } : {});
  params.set(flag, "1");
  return `/${locale}/studio/inbox?${params}`;
}

/** The inbox capabilities check the editor's scope and the input; a refusal is reported like a failure. */
async function runInbox(name: string, input: Record<string, unknown>) {
  const outcome = await runEditorCapability(name, input, { confirmed: true });
  if (!outcome.ok) throw new Error(outcome.error);
}

export async function setContactStatusAction(formData: FormData) {
  const locale = readLocale(formData);
  await requireEditor(locale);

  let flag = "updated";
  try {
    await runInbox("admin_update_contact_message", { id: formData.get("id"), status: formData.get("status") });
  } catch (error) {
    console.error("studio inbox: status change failed", error);
    flag = "error";
  }
  redirect(inboxPath(locale, formData, flag));
}

export async function deleteContactMessageAction(
  _previous: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  const locale = readLocale(formData);
  await requireEditor(locale);

  // The person confirmed this deletion in the page (window.confirm) before the form was sent.
  try {
    await runInbox("admin_delete_contact_message", { id: formData.get("id") });
  } catch (error) {
    console.error("studio inbox: delete failed", error);
    return { status: "error", message: inboxCopy[locale].failed };
  }
  redirect(inboxPath(locale, formData, "deleted"));
}
