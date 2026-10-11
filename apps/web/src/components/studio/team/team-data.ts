import { redirect } from "next/navigation";
import type { TeamMember } from "@atlasnews/core/team/domain/team";
import type { Locale } from "@/i18n";
import {
  runEditorCapability,
  type CapabilityRunOptions,
  type CapabilityRunResult,
} from "@/server/capabilities";

/** Runs one team capability for the signed-in admin; a missing sign-in goes to the login page. */
export async function runTeamCapability(
  locale: Locale,
  name: string,
  input: unknown,
  options: CapabilityRunOptions = {},
): Promise<CapabilityRunResult> {
  const outcome = await runEditorCapability(name, input, options);
  if (!outcome.ok && outcome.status === 401) redirect(`/${locale}/login`);
  return outcome;
}

/** What `admin_list_editors` shows of a member (never the sign-in account id). */
export type TeamRow = Omit<TeamMember, "userId">;

export async function listTeamRows(locale: Locale): Promise<TeamRow[]> {
  const listed = await runTeamCapability(locale, "admin_list_editors", {});
  if (!listed.ok) throw new Error(listed.error);
  return (listed.result as { members: TeamRow[] }).members;
}
