import type { EditorDirectory, TeamInvitation } from "@atlasnews/core/team/domain/ports";
import { teamMessages, TeamRuleError, type TeamMember, type TeamRole } from "@atlasnews/core/team/domain/team";

/** The demo team, in memory: an invitation is a member that nobody has signed in as yet. */
export class MemoryEditorDirectory implements EditorDirectory {
  private readonly members: TeamMember[];

  constructor(initial: readonly TeamMember[] = []) {
    this.members = initial.map((member) => ({ ...member }));
  }

  async list() {
    return this.members.map((member) => ({ ...member }));
  }

  async invite({ email, role, name }: TeamInvitation) {
    if (this.members.some((member) => member.email === email)) throw new TeamRuleError(teamMessages.alreadyMember);
    const member: TeamMember = {
      id: crypto.randomUUID(),
      email,
      role,
      authorId: crypto.randomUUID(),
      authorName: name,
      status: "invited",
      userId: null,
    };
    this.members.push(member);
    return { member: { ...member }, emailSent: false };
  }

  async setRole(id: string, role: TeamRole) {
    const member = this.members.find((candidate) => candidate.id === id);
    if (!member) return null;
    member.role = role;
    return { ...member };
  }

  async remove(id: string) {
    const index = this.members.findIndex((member) => member.id === id);
    if (index < 0) return false;
    this.members.splice(index, 1);
    return true;
  }
}
