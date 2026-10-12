import type { EditorDirectory } from "../domain/ports";
import {
  assertTeamRole,
  isActiveAdmin,
  memberDisplayName,
  normalizeTeamEmail,
  TeamRuleError,
  teamMessages,
  type TeamMember,
  type TeamRole,
} from "../domain/team";

/**
 * Who is asking. `subject` is the sign-in account (`Principal.subject`) and `authorId` the editor's author
 * when known: either one naming a member means the admin is acting on themselves, whichever provider
 * they signed in with.
 */
export interface TeamActor {
  subject: string;
  authorId?: string;
}

export interface InviteInput {
  email: string;
  role?: TeamRole;
  name?: string;
}

function isSelf(member: TeamMember, actor: TeamActor) {
  return (member.userId !== null && member.userId === actor.subject)
    || (actor.authorId !== undefined && member.authorId === actor.authorId);
}

/** The rules of managing a newsroom team, whichever surface (Studio, MCP, page tool) asks. */
export class TeamService {
  constructor(private readonly directory: EditorDirectory) {}

  async list() {
    const members = await this.directory.list();
    return members.sort((left, right) => left.email.localeCompare(right.email));
  }

  async invite(input: InviteInput) {
    const email = normalizeTeamEmail(input.email);
    const role = input.role ?? "editor";
    assertTeamRole(role);
    const name = memberDisplayName(email, input.name);
    if ((await this.directory.list()).some((member) => member.email === email)) {
      throw new TeamRuleError(teamMessages.alreadyMember, "team.alreadyMember");
    }
    return this.directory.invite({ email, role, name });
  }

  async setRole(id: string, role: TeamRole) {
    assertTeamRole(role);
    const members = await this.directory.list();
    const member = this.find(members, id);
    if (member.role === role) return member;
    if (role !== "admin") this.assertNotLastAdmin(members, member);
    const updated = await this.directory.setRole(id, role);
    if (!updated) throw new TeamRuleError(teamMessages.notFound, "team.notFound");
    return updated;
  }

  async remove(id: string, actor: TeamActor) {
    const members = await this.directory.list();
    const member = this.find(members, id);
    if (isSelf(member, actor)) throw new TeamRuleError(teamMessages.removeSelf, "team.removeSelf");
    this.assertNotLastAdmin(members, member);
    if (!(await this.directory.remove(id))) throw new TeamRuleError(teamMessages.notFound, "team.notFound");
    return member;
  }

  private find(members: readonly TeamMember[], id: string) {
    const member = members.find((candidate) => candidate.id === id);
    if (!member) throw new TeamRuleError(teamMessages.notFound, "team.notFound");
    return member;
  }

  /** Taking away `member`'s admin rights (demoting or removing them) must leave another active admin. */
  private assertNotLastAdmin(members: readonly TeamMember[], member: TeamMember) {
    if (!isActiveAdmin(member)) return;
    if (!members.some((other) => other.id !== member.id && isActiveAdmin(other))) {
      throw new TeamRuleError(teamMessages.lastAdmin, "team.lastAdmin");
    }
  }
}
