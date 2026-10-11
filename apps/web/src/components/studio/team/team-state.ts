import type { TeamRole } from "@atlasnews/core/team/domain/team";

/** What the invitation form posts, as typed: returned with an error so the inputs keep it. */
export interface InviteFormValues {
  email: string;
  name: string;
  role: TeamRole;
}

export interface InviteFormState {
  status: "idle" | "error";
  message?: string;
  values?: InviteFormValues;
}

export const idleInviteFormState: InviteFormState = { status: "idle" };
