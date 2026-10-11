"use server";

import { redirect } from "next/navigation";
import * as z from "zod/v4";
import type { StudioActionState } from "@/components/studio/action-state";
import { defaultLocale, isLocale, type Locale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getStudioContactMessageService } from "@/server/composition";
import { contactIdSchema, contactStatusSchema } from "@atlasnews/core/support/domain/contact-message";
import { inboxCopy } from "./copy";

const statusFormSchema = z.object({ id: contactIdSchema, status: contactStatusSchema });

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

export async function setContactStatusAction(formData: FormData) {
  const locale = readLocale(formData);
  await requireEditor(locale);
  const input = statusFormSchema.safeParse({ id: formData.get("id"), status: formData.get("status") });

  let flag = "updated";
  try {
    const service = await getStudioContactMessageService();
    if (!input.success || !service) throw new Error("The message could not be changed.");
    await service.setStatus(input.data.id, input.data.status);
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
  const id = contactIdSchema.safeParse(formData.get("id"));

  // The person confirmed this deletion in the page (window.confirm) before the form was sent.
  try {
    const service = await getStudioContactMessageService();
    if (!id.success || !service) throw new Error("The message could not be deleted.");
    await service.delete(id.data);
  } catch (error) {
    console.error("studio inbox: delete failed", error);
    return { status: "error", message: inboxCopy[locale].failed };
  }
  redirect(inboxPath(locale, formData, "deleted"));
}
