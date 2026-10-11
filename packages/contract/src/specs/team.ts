import * as z from "zod/v4";

import { teamLimits, teamRoles } from "@atlasnews/core/team/domain/team";

import { destructive, externalWrite, readOnly, write } from "../annotations";
import { defineSpec } from "../capability";
import { editorialUnavailable } from "./editorial";

const roleSchema = z.enum(teamRoles);
const idSchema = z.string().trim().min(1).max(100).describe("Id of the team member, from admin_list_editors.");

const memberSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: roleSchema,
  status: z.enum(["invited", "active"]).describe("invited: nobody has signed in with this address yet."),
  authorId: z.string().describe("The author that this person's articles are attributed to."),
  authorName: z.string(),
});
const memberResult = z.object({ member: memberSchema });

const roles =
  "An editor writes, publishes and moderates; an admin can also manage the team. The newsroom always keeps at least one active admin.";

const base = { surfaces: ["mcp", "page"], scopes: ["newsroom.admin"], unavailableMessage: editorialUnavailable } as const;

export const adminListEditors = defineSpec({
  ...base,
  name: "admin_list_editors",
  title: "List newsroom team",
  description: `List the people who can sign in to the newsroom: address, role, and whether they have signed in yet. Admins only. ${roles}`,
  input: z.object({}),
  output: z.object({ members: z.array(memberSchema) }),
  annotations: readOnly,
});

export const adminInviteEditor = defineSpec({
  ...base,
  name: "admin_invite_editor",
  title: "Invite newsroom editor",
  description:
    "Invite a person to the newsroom by email address, as an editor (default) or an admin. Admins only. "
    + "With Supabase the person gets an invitation email; on ChatGPT Sites no email is sent (`emailSent` is false): "
    + "tell them to sign in with that address. An address that already belongs to the team is refused. "
    + roles,
  input: z.object({
    email: z.string().trim().max(teamLimits.email.max).describe("Email address the person signs in with."),
    role: roleSchema.optional().describe("Defaults to editor."),
    name: z.string().trim().max(teamLimits.name.max).optional()
      .describe("Name shown on their articles; defaults to the part of the address before the @."),
  }),
  output: z.object({ member: memberSchema, emailSent: z.boolean() }),
  annotations: externalWrite,
});

export const adminUpdateEditor = defineSpec({
  ...base,
  name: "admin_update_editor",
  title: "Change newsroom role",
  description: `Change the role of a team member to editor or admin. Admins only. The last active admin cannot be demoted. ${roles}`,
  input: z.object({ id: idSchema, role: roleSchema }),
  output: memberResult,
  annotations: write,
});

export const adminRemoveEditor = defineSpec({
  ...base,
  name: "admin_remove_editor",
  title: "Remove newsroom editor",
  description:
    "Remove a person's access to the newsroom: they can no longer sign in to the Studio or use the newsroom tools. "
    + "Their articles stay. Admins only. You cannot remove yourself or the last active admin. "
    + "On ChatGPT Sites an address listed in ATLASNEWS_ADMIN_EMAILS or ATLASNEWS_EDITOR_EMAILS is added again at its next sign-in, so it must also leave that list.",
  input: z.object({ id: idSchema }),
  output: z.object({ removedId: z.string(), email: z.string() }),
  annotations: destructive,
  confirmation: {
    async question({ id }, ports) {
      const member = (await (await ports.team()).list()).find((candidate) => candidate.id === id);
      return `Remove ${member ? `${member.email} (${member.role})` : "this person"} from the newsroom team? They lose access at once.`;
    },
  },
});

export const teamSpecs = [adminListEditors, adminInviteEditor, adminUpdateEditor, adminRemoveEditor] as const;
