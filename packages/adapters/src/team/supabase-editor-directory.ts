import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { EditorDirectory, TeamInvitation } from "@atlasnews/core/team/domain/ports";
import {
  memberInitials,
  teamMessages,
  TeamRuleError,
  type TeamMember,
  type TeamRole,
} from "@atlasnews/core/team/domain/team";

interface ProfileRow {
  id: string;
  role: TeamRole;
  author_id: string;
  author: { name: string } | { name: string }[] | null;
}

const profileColumns = "id, role, author_id, author:authors(name)";
const pageSize = 200;

function failed(action: string, error: { message: string }): never {
  throw new Error(`Team ${action} failed: ${error.message}`);
}

function authorNameOf(row: ProfileRow) {
  const author = Array.isArray(row.author) ? row.author[0] : row.author;
  return author?.name ?? "";
}

function toMember(row: ProfileRow, user: User | undefined): TeamMember {
  return {
    id: row.id,
    email: (user?.email ?? "").toLowerCase(),
    role: row.role,
    authorId: row.author_id,
    authorName: authorNameOf(row),
    // Accepting an invitation confirms the address and signs the person in.
    status: user?.email_confirmed_at || user?.last_sign_in_at ? "active" : "invited",
    userId: row.id,
  };
}

/**
 * The self-hosted team: `public.profiles` holds the role, `auth.users` the address. Everything runs with
 * the service-role client (RLS does not apply), so the Studio and the MCP server must have checked that
 * the caller is an admin. Removing someone deletes the profile only: the Auth user and their author stay.
 */
export class SupabaseEditorDirectory implements EditorDirectory {
  constructor(
    private readonly client: SupabaseClient,
    /** Where the invitation email sends the person; must be one of the project's allowed redirect URLs. */
    private readonly redirectTo?: string,
  ) {}

  async list() {
    const { data, error } = await this.client.from("profiles").select(profileColumns).order("created_at");
    if (error) failed("list", error);
    const rows = data as unknown as ProfileRow[];
    const wanted = new Set(rows.map((row) => row.id));
    const users = new Map<string, User>();
    // The Auth API has no lookup by several ids: read its pages until every profile has its user.
    for (let page = 1; users.size < wanted.size; page += 1) {
      const { data: listed, error: listError } = await this.client.auth.admin.listUsers({ page, perPage: pageSize });
      if (listError) failed("list", listError);
      for (const user of listed.users) if (wanted.has(user.id)) users.set(user.id, user);
      if (listed.users.length < pageSize) break;
    }
    return rows.map((row) => toMember(row, users.get(row.id)));
  }

  async invite({ email, role, name }: TeamInvitation) {
    let user: User;
    let emailSent = true;
    const invited = await this.client.auth.admin.inviteUserByEmail(email, this.redirectTo ? { redirectTo: this.redirectTo } : undefined);
    if (invited.data.user) {
      user = invited.data.user;
    } else if (invited.error?.code === "email_exists") {
      // Someone removed from the team earlier (their Auth user stays) or a reader: no new email, they sign in as before.
      const existing = await this.findUserByEmail(email);
      if (!existing) failed("invite", invited.error);
      user = existing;
      emailSent = false;
    } else {
      return failed("invite", invited.error ?? { message: "no user returned" });
    }

    const created = emailSent;
    try {
      const { data: author, error: authorError } = await this.client.from("authors")
        .insert({ name, role: "Editor", initials: memberInitials(name) }).select("id").single();
      if (authorError) failed("invite", authorError);
      const { error: profileError } = await this.client.from("profiles").insert({ id: user.id, author_id: author.id, role });
      if (profileError) {
        await this.client.from("authors").delete().eq("id", author.id);
        if (profileError.code === "23505") throw new TeamRuleError(teamMessages.alreadyMember);
        failed("invite", profileError);
      }
      return {
        member: toMember({ id: user.id, role, author_id: author.id, author: { name } }, user),
        emailSent,
      };
    } catch (error) {
      // The invitation made this Auth user a moment ago and nothing uses it yet: do not leave it half-created.
      if (created) await this.client.auth.admin.deleteUser(user.id);
      throw error;
    }
  }

  async setRole(id: string, role: TeamRole) {
    const { data, error } = await this.client.from("profiles").update({ role }).eq("id", id).select(profileColumns).maybeSingle();
    if (error) failed("update", error);
    if (!data) return null;
    const { data: found } = await this.client.auth.admin.getUserById(id);
    return toMember(data as unknown as ProfileRow, found.user ?? undefined);
  }

  async remove(id: string) {
    const { data, error } = await this.client.from("profiles").delete().eq("id", id).select("author_id");
    if (error) failed("remove", error);
    const [removed] = data ?? [];
    if (!removed) return false;
    // An author that wrote nothing goes too; one with articles is refused by the foreign key and stays.
    await this.client.from("authors").delete().eq("id", removed.author_id);
    return true;
  }

  private async findUserByEmail(email: string) {
    for (let page = 1; ; page += 1) {
      const { data, error } = await this.client.auth.admin.listUsers({ page, perPage: pageSize });
      if (error) failed("invite", error);
      const match = data.users.find((user) => user.email?.toLowerCase() === email);
      if (match || data.users.length < pageSize) return match;
    }
  }
}
