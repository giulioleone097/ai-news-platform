import type { TeamMember, TeamRole } from "./team";

export interface TeamInvitation {
  /** Already normalised and checked by the service. */
  email: string;
  role: TeamRole;
  /** The author name for the new member (`memberDisplayName`). */
  name: string;
}

/**
 * The team of a newsroom in its store. The service checks the rules against `list()` first; an
 * adapter still refuses what its store can check atomically (a duplicate address, the last admin)
 * with a `TeamRuleError`, so two concurrent requests cannot break them.
 */
export interface EditorDirectory {
  list(): Promise<TeamMember[]>;
  /** Creates the membership and its author. `emailSent` is false where the person simply signs in with that address. */
  invite(invitation: TeamInvitation): Promise<{ member: TeamMember; emailSent: boolean }>;
  /** Null when no member has this id. */
  setRole(id: string, role: TeamRole): Promise<TeamMember | null>;
  /** Removes the access only: the author and the articles stay. False when no member has this id. */
  remove(id: string): Promise<boolean>;
}
