import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { teamMessages } from "@atlasnews/core/team/domain/team";
import { SupabaseEditorDirectory } from "./supabase-editor-directory";

type Row = Record<string, unknown>;

/** A Supabase client over in-memory tables: just the calls the directory makes. */
function fakeSupabase(options: { users?: Row[]; profiles?: Row[]; authors?: Row[]; inviteError?: { code: string; message: string } } = {}) {
  const tables: Record<string, Row[]> = { profiles: options.profiles ?? [], authors: options.authors ?? [] };
  const users = options.users ?? [];
  const calls = { deleteUser: [] as string[], invite: [] as unknown[] };
  let nextId = 1;

  function query(table: string) {
    let operation: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row = {};
    let filter: Row = {};
    let wantsRows = false;
    const matching = () => tables[table]!.filter((row) => Object.entries(filter).every(([key, value]) => row[key] === value));
    const run = () => {
      if (operation === "insert") {
        if (table === "profiles" && tables.profiles!.some((row) => row.id === payload.id)) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        const row = { id: `author-${nextId++}`, ...payload };
        tables[table]!.push(row);
        return { data: wantsRows ? [row] : null, error: null };
      }
      const rows = matching();
      if (operation === "update") rows.forEach((row) => Object.assign(row, payload));
      if (operation === "delete") tables[table] = tables[table]!.filter((row) => !rows.includes(row));
      const shaped = rows.map((row) => (table === "profiles"
        ? { ...row, author: { name: tables.authors!.find((author) => author.id === row.author_id)?.name } }
        : row));
      return { data: shaped, error: null };
    };
    const builder: Record<string, unknown> = {
      select() { wantsRows = true; return builder; },
      insert(value: Row) { operation = "insert"; payload = value; return builder; },
      update(value: Row) { operation = "update"; payload = value; return builder; },
      delete() { operation = "delete"; return builder; },
      eq(key: string, value: unknown) { filter = { ...filter, [key]: value }; return builder; },
      order() { return builder; },
      single: async () => ({ data: (run().data as Row[])[0], error: null }),
      maybeSingle: async () => ({ data: (run().data as Row[])[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return builder;
  }

  const client = {
    from: query,
    auth: {
      admin: {
        listUsers: async () => ({ data: { users }, error: null }),
        getUserById: async (id: string) => ({ data: { user: users.find((user) => user.id === id) ?? null }, error: null }),
        inviteUserByEmail: async (email: string, invitation?: unknown) => {
          calls.invite.push([email, invitation]);
          if (options.inviteError) return { data: { user: null }, error: options.inviteError };
          const user = { id: `user-${nextId++}`, email, email_confirmed_at: null, last_sign_in_at: null };
          users.push(user);
          return { data: { user }, error: null };
        },
        deleteUser: vi.fn(async (id: string) => { calls.deleteUser.push(id); return { error: null }; }),
      },
    },
  };
  return { client: client as unknown as SupabaseClient, tables, users, calls };
}

const confirmed = { email_confirmed_at: "2026-10-01T10:00:00Z", last_sign_in_at: "2026-10-02T10:00:00Z" };

describe("SupabaseEditorDirectory", () => {
  it("lists profiles with the address and status of their Auth user", async () => {
    const { client } = fakeSupabase({
      users: [{ id: "u1", email: "Boss@Example.com", ...confirmed }, { id: "u2", email: "new@example.com", email_confirmed_at: null, last_sign_in_at: null }],
      authors: [{ id: "a1", name: "Boss" }, { id: "a2", name: "New" }],
      profiles: [{ id: "u1", role: "admin", author_id: "a1" }, { id: "u2", role: "editor", author_id: "a2" }],
    });
    expect(await new SupabaseEditorDirectory(client).list()).toEqual([
      { id: "u1", email: "boss@example.com", role: "admin", authorId: "a1", authorName: "Boss", status: "active", userId: "u1" },
      { id: "u2", email: "new@example.com", role: "editor", authorId: "a2", authorName: "New", status: "invited", userId: "u2" },
    ]);
  });

  it("invites by email through the Auth admin API and creates the author and profile", async () => {
    const { client, tables, calls } = fakeSupabase();
    const { member, emailSent } = await new SupabaseEditorDirectory(client, "https://site.example/en/auth/callback")
      .invite({ email: "mario@example.com", role: "editor", name: "Mario Bianchi" });

    expect(emailSent).toBe(true);
    expect(calls.invite).toEqual([["mario@example.com", { redirectTo: "https://site.example/en/auth/callback" }]]);
    expect(tables.authors).toEqual([expect.objectContaining({ name: "Mario Bianchi", role: "Editor", initials: "MB" })]);
    expect(tables.profiles).toEqual([expect.objectContaining({ id: member.id, role: "editor", author_id: member.authorId })]);
    expect(member).toMatchObject({ email: "mario@example.com", status: "invited", authorName: "Mario Bianchi", userId: member.id });
  });

  it("gives an existing Auth user without a profile access, with no new email", async () => {
    const { client, tables, calls } = fakeSupabase({
      users: [{ id: "u9", email: "former@example.com", ...confirmed }],
      inviteError: { code: "email_exists", message: "already registered" },
    });
    const { member, emailSent } = await new SupabaseEditorDirectory(client).invite({ email: "former@example.com", role: "admin", name: "Former" });
    expect(emailSent).toBe(false);
    expect(member).toMatchObject({ id: "u9", role: "admin", status: "active" });
    expect(tables.profiles).toHaveLength(1);
    expect(calls.deleteUser).toEqual([]);
  });

  it("undoes the invitation when the profile cannot be written", async () => {
    const { client, tables, calls } = fakeSupabase({ authors: [], profiles: [] });
    const directory = new SupabaseEditorDirectory(client);
    // A profile for this id appears between the invitation and the insert.
    let invited = "";
    vi.spyOn(client.auth.admin, "inviteUserByEmail").mockImplementationOnce(async () => {
      invited = "user-race";
      tables.profiles!.push({ id: invited, role: "editor", author_id: "a0" });
      return { data: { user: { id: invited, email: "race@example.com" } }, error: null } as never;
    });
    await expect(directory.invite({ email: "race@example.com", role: "editor", name: "Race" })).rejects.toThrow(teamMessages.alreadyMember);
    expect(calls.deleteUser).toEqual([invited]);
    expect(tables.authors).toEqual([]);
  });

  it("changes a role and removes access without deleting the Auth user", async () => {
    const { client, tables, users, calls } = fakeSupabase({
      users: [{ id: "u2", email: "ed@example.com", ...confirmed }],
      authors: [{ id: "a2", name: "Ed" }],
      profiles: [{ id: "u2", role: "editor", author_id: "a2" }],
    });
    const directory = new SupabaseEditorDirectory(client);
    expect(await directory.setRole("u2", "admin")).toMatchObject({ id: "u2", role: "admin", email: "ed@example.com" });
    expect(await directory.setRole("missing", "admin")).toBeNull();
    expect(await directory.remove("u2")).toBe(true);
    expect(await directory.remove("u2")).toBe(false);
    expect(tables.profiles).toEqual([]);
    expect(users).toHaveLength(1);
    expect(calls.deleteUser).toEqual([]);
  });
});
