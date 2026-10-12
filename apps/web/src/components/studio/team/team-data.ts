import type { TeamMember } from "@atlasnews/core/team/domain/team";
import type { Locale } from "@/i18n";
import { runStudioCapability } from "@/server/studio-capability";

/** What `admin_list_editors` shows of a member (never the sign-in account id). */
export type TeamRow = Omit<TeamMember, "userId">;

export async function listTeamRows(locale: Locale): Promise<TeamRow[]> {
  const listed = await runStudioCapability(locale, "admin_list_editors", {});
  if (!listed.ok) throw new Error(listed.error);
  return (listed.result as { members: TeamRow[] }).members;
}
