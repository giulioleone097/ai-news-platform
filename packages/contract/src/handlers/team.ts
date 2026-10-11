import { TeamService } from "@atlasnews/core/team/application/team-service";
import type { TeamMember } from "@atlasnews/core/team/domain/team";

import { implement } from "../capability";
import type { CapabilityPorts } from "../ports";
import { adminInviteEditor, adminListEditors, adminRemoveEditor, adminUpdateEditor } from "../specs/team";

async function team(ports: CapabilityPorts) {
  return new TeamService(await ports.team());
}

/** What callers see: the sign-in account id behind a member is for the service's self-removal rule only. */
function shown(member: TeamMember) {
  return { id: member.id, email: member.email, role: member.role, status: member.status, authorId: member.authorId, authorName: member.authorName };
}

/** Managing the team is admin-only (`newsroom.admin`); no handler here checks the role again. */
export const teamCapabilities = [
  implement(adminListEditors, async (ports) => ({ members: (await (await team(ports)).list()).map(shown) })),

  implement(adminInviteEditor, async (ports, input) => {
    const { member, emailSent } = await (await team(ports)).invite(input);
    return { member: shown(member), emailSent };
  }),

  implement(adminUpdateEditor, async (ports, { id, role }) => ({ member: shown(await (await team(ports)).setRole(id, role)) })),

  implement(adminRemoveEditor, async (ports, { id }, principal) => {
    const actor = principal.kind === "editor"
      ? { subject: principal.subject, ...(principal.authorId ? { authorId: principal.authorId } : {}) }
      : { subject: "" };
    const member = await (await team(ports)).remove(id, actor);
    return { removedId: member.id, email: member.email };
  }),
];
