import { EditorialRuleError } from "../../editorial/domain/errors";

/** Who may sign in to the Studio and the newsroom tools. Only `admin` manages the team. */
export const teamRoles = ["editor", "admin"] as const;
export type TeamRole = (typeof teamRoles)[number];

/** `invited`: the address is allowed in but nobody has signed in with it yet. */
export type TeamMemberStatus = "invited" | "active";

export interface TeamMember {
  /** Stable key of the membership in its store; what the update and remove tools take. */
  id: string;
  /** Lowercase, as stored. Unique across the team. */
  email: string;
  role: TeamRole;
  /** The `authors` row that this person's articles are attributed to. */
  authorId: string;
  authorName: string;
  status: TeamMemberStatus;
  /**
   * The sign-in account (`Principal.subject`) last seen for the member; null until the invitation is used.
   * Not shown to callers: it, with `authorId`, only lets the service tell that an admin is acting on themselves.
   */
  userId: string | null;
}

/** An anticipated refusal of a team rule. The message is written for the caller and safe to show. */
export class TeamRuleError extends EditorialRuleError {
  override readonly name: string = "TeamRuleError";
}

export const teamLimits = {
  email: { max: 254 },
  name: { min: 2, max: 120 },
} as const;

export const teamMessages = {
  invalidEmail: "Enter a valid email address.",
  invalidRole: "The role must be editor or admin.",
  invalidName: `The display name must be ${teamLimits.name.min}-${teamLimits.name.max} characters.`,
  alreadyMember: "This email address already belongs to a team member.",
  notFound: "Team member not found.",
  lastAdmin: "The team needs at least one active admin: make someone else an admin first.",
  removeSelf: "You cannot remove yourself from the team. Ask another admin.",
} as const;

// The same shape the newsletter accepts: one `@`, a dotted domain, no spaces.
const emailShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The lowercase address, or a rule error when it cannot be one. */
export function normalizeTeamEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > teamLimits.email.max || !emailShape.test(email)) throw new TeamRuleError(teamMessages.invalidEmail, "team.invalidEmail");
  return email;
}

export function assertTeamRole(value: string): asserts value is TeamRole {
  if (!(teamRoles as readonly string[]).includes(value)) throw new TeamRuleError(teamMessages.invalidRole, "team.invalidRole");
}

/** The author name of a new member: the display name when given, else the part of the email before the @. */
export function memberDisplayName(email: string, name?: string) {
  const given = name?.trim();
  if (given) {
    if (given.length < teamLimits.name.min || given.length > teamLimits.name.max) {
      throw new TeamRuleError(teamMessages.invalidName, "team.invalidName", teamLimits.name);
    }
    return given;
  }
  const local = (email.split("@")[0] ?? "").trim().slice(0, teamLimits.name.max);
  return local.length >= teamLimits.name.min ? local : "Editor";
}

/** Up to two initials from a display name, as `authors.initials` allows. */
export function memberInitials(name: string) {
  const letters = name.split(/[\s._-]+/).filter(Boolean).map((part) => part[0]!.toUpperCase());
  return letters.join("").slice(0, 2) || "ED";
}

/** Whether the member can still act: an invited admin has never signed in, so does not count as a way back in. */
export function isActiveAdmin(member: TeamMember) {
  return member.role === "admin" && member.status === "active";
}
