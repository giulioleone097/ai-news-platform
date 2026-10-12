"use server";

import { redirect } from "next/navigation";
import { teamRoles, type TeamRole } from "@atlasnews/core/team/domain/team";
import type { Locale } from "@/i18n";
import type { StudioActionState } from "@/components/studio/action-state";
import type { InviteFormState } from "@/components/studio/team/team-state";
import type { CapabilityRunResult } from "@/server/capabilities";
import { readLocale, runStudioCapability } from "@/server/studio-capability";
import { teamCopy } from "./copy";

function readRole(formData: FormData): TeamRole {
  const value = String(formData.get("role") ?? "");
  return (teamRoles as readonly string[]).includes(value) ? (value as TeamRole) : "editor";
}

/**
 * What the person sees when a capability refuses: its own message, in their language, for a broken rule (400), a plain
 * "admins only" for a missing permission (403, an editor who posted the form anyway), and the generic
 * failure for anything unexpected. The permission itself is checked inside the capability, not here.
 */
function failure(outcome: Extract<CapabilityRunResult, { ok: false }>, locale: Locale, generic: string) {
  if (outcome.status === 400) return outcome.error;
  return outcome.status === 403 ? teamCopy[locale].forbidden : generic;
}

export async function inviteMemberAction(_previous: InviteFormState, formData: FormData): Promise<InviteFormState> {
  const locale = readLocale(formData);
  const values = {
    email: String(formData.get("email") ?? ""),
    name: String(formData.get("name") ?? ""),
    role: readRole(formData),
  };
  const name = values.name.trim();
  const outcome = await runStudioCapability(locale, "admin_invite_editor", {
    email: values.email,
    role: values.role,
    ...(name ? { name } : {}),
  });
  if (!outcome.ok) return { status: "error", message: failure(outcome, locale, teamCopy[locale].inviteFailed), values };
  redirect(`/${locale}/studio/team?invited=${outcome.result.emailSent === true ? "sent" : "saved"}`);
}

export async function changeRoleAction(_previous: StudioActionState, formData: FormData): Promise<StudioActionState> {
  const locale = readLocale(formData);
  const outcome = await runStudioCapability(locale, "admin_update_editor", {
    id: String(formData.get("id") ?? ""),
    role: readRole(formData),
  });
  if (!outcome.ok) return { status: "error", message: failure(outcome, locale, teamCopy[locale].roleFailed) };
  redirect(`/${locale}/studio/team?updated=1`);
}

export async function removeMemberAction(_previous: StudioActionState, formData: FormData): Promise<StudioActionState> {
  const locale = readLocale(formData);
  // The person confirmed this exact removal in the page before the form was submitted.
  const outcome = await runStudioCapability(
    locale,
    "admin_remove_editor",
    { id: String(formData.get("id") ?? "") },
    { confirmed: true },
  );
  if (!outcome.ok) return { status: "error", message: failure(outcome, locale, teamCopy[locale].removeFailed) };
  redirect(`/${locale}/studio/team?removed=1`);
}
