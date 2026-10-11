import type { EditorDirectory, TeamInvitation } from "@atlasnews/core/team/domain/ports";
import {
  memberInitials,
  teamMessages,
  TeamRuleError,
  type TeamMember,
  type TeamRole,
} from "@atlasnews/core/team/domain/team";
import type { D1Database } from "../sites/cloudflare";

interface MemberRow {
  id: string;
  email: string;
  role: TeamRole;
  user_id: string | null;
  author_id: string;
  author_name: string;
}

const select = `SELECT editors.id, editors.email, editors.role, editors.user_id, editors.author_id, authors.name AS author_name
  FROM editors JOIN authors ON authors.id = editors.author_id`;

function toMember(row: MemberRow): TeamMember {
  return {
    id: row.id,
    email: row.email.toLowerCase(),
    role: row.role,
    authorId: row.author_id,
    authorName: row.author_name,
    status: row.user_id ? "active" : "invited",
    userId: row.user_id,
  };
}

/**
 * Leaves an admin that someone has signed in as. Used by the two statements that would take admin
 * rights away (demote, remove), so two concurrent requests cannot both pass: D1 runs one write at a time.
 */
const keepsAnotherActiveAdmin =
  "(editors.role != 'admin' OR editors.user_id IS NULL OR EXISTS (SELECT 1 FROM editors other WHERE other.id != editors.id AND other.role = 'admin' AND other.user_id IS NOT NULL))";

/**
 * The Sites team over the `editors` table (`apps/web/drizzle/0001_editors.sql`). An invitation is a row
 * with the address, the role and an author but no `user_id`; the first sign-in with that verified address,
 * through any provider, makes it active (`resolveSitesEditor`). No email is sent: the person just signs in.
 */
export class D1EditorDirectory implements EditorDirectory {
  constructor(
    private readonly database: D1Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list() {
    const { results } = await this.database.prepare(`${select} ORDER BY editors.email`).all<MemberRow>();
    return results.map(toMember);
  }

  async invite({ email, role, name }: TeamInvitation) {
    const authorId = crypto.randomUUID();
    const id = crypto.randomUUID();
    const now = this.now().toISOString();
    try {
      // One batch: the unique email of `editors` fails the second statement and rolls the author back.
      await this.database.batch([
        this.database.prepare(
          "INSERT INTO authors (id, name, role, initials, avatar_url, created_at) VALUES (?, ?, 'Editor', ?, NULL, ?)",
        ).bind(authorId, name, memberInitials(name), now),
        this.database.prepare(
          "INSERT INTO editors (id, email, user_id, author_id, role, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?)",
        ).bind(id, email, authorId, role, now, now),
      ]);
    } catch (error) {
      if (/UNIQUE/i.test(error instanceof Error ? error.message : String(error))) throw new TeamRuleError(teamMessages.alreadyMember);
      throw error;
    }
    return { member: toMember({ id, email, role, user_id: null, author_id: authorId, author_name: name }), emailSent: false };
  }

  async setRole(id: string, role: TeamRole) {
    const changed = await this.database.prepare(
      `UPDATE editors SET role = ?1, updated_at = ?2 WHERE id = ?3 AND (?1 = 'admin' OR ${keepsAnotherActiveAdmin}) RETURNING id`,
    ).bind(role, this.now().toISOString(), id).first();
    const member = await this.find(id);
    if (!changed && member) throw new TeamRuleError(teamMessages.lastAdmin);
    return member;
  }

  async remove(id: string) {
    const member = await this.find(id);
    if (!member) return false;
    const [removed] = await this.database.batch([
      this.database.prepare(`DELETE FROM editors WHERE id = ? AND ${keepsAnotherActiveAdmin}`).bind(id),
      // The author goes with an access that wrote nothing; one with articles stays, as does a shared one.
      this.database.prepare(
        `DELETE FROM authors WHERE id = ?
           AND NOT EXISTS (SELECT 1 FROM editors WHERE author_id = authors.id)
           AND NOT EXISTS (SELECT 1 FROM articles WHERE author_id = authors.id)`,
      ).bind(member.authorId),
    ]);
    if (removed!.meta.changes > 0) return true;
    // The guard held the row back: the member is still there unless a concurrent request removed it.
    if (await this.find(id)) throw new TeamRuleError(teamMessages.lastAdmin);
    return false;
  }

  private async find(id: string) {
    const row = await this.database.prepare(`${select} WHERE editors.id = ?`).bind(id).first<MemberRow>();
    return row ? toMember(row) : null;
  }
}
