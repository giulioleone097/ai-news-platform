import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { teamMessages } from "@atlasnews/core/team/domain/team";
import { TeamService } from "@atlasnews/core/team/application/team-service";
import { resolveSitesEditor } from "../sites/editors";
import { createSitesTestStore, type SitesTestStore } from "../sites/testing";
import { D1EditorDirectory } from "./d1-editor-directory";

describe("D1EditorDirectory", () => {
  let store: SitesTestStore;
  let directory: D1EditorDirectory;
  beforeAll(async () => {
    store = await createSitesTestStore();
    directory = new D1EditorDirectory(store.database);
  });
  afterAll(() => store.dispose());
  beforeEach(async () => {
    await store.database.batch([
      store.database.prepare("DELETE FROM articles"),
      store.database.prepare("DELETE FROM editors"),
      store.database.prepare("DELETE FROM authors"),
    ]);
  });

  /** An admin who has signed in, the way `resolveSitesEditor` creates one. */
  async function signedInAdmin(email: string, userId: string) {
    await resolveSitesEditor(store.database, { userId, email, fullName: `Admin ${userId}` }, { adminEmails: [email] });
  }

  async function count(table: string) {
    return (await store.database.prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
  }

  it("invites with a new author and no user id, and lists the invitation", async () => {
    const { member, emailSent } = await directory.invite({ email: "mario.bianchi@example.com", role: "editor", name: "Mario Bianchi" });
    expect(emailSent).toBe(false);
    expect(member).toMatchObject({ email: "mario.bianchi@example.com", role: "editor", authorName: "Mario Bianchi", status: "invited", userId: null });

    const author = await store.database.prepare("SELECT name, role, initials FROM authors WHERE id = ?").bind(member.authorId).first();
    expect(author).toEqual({ name: "Mario Bianchi", role: "Editor", initials: "MB" });
    expect(await directory.list()).toEqual([member]);
  });

  it("lets the invited person claim the invitation by signing in with the address", async () => {
    const { member } = await directory.invite({ email: "Mario@Example.com".toLowerCase(), role: "editor", name: "Mario" });
    const editor = await resolveSitesEditor(store.database, { userId: "user-mario", email: "MARIO@example.com", fullName: null });
    expect(editor).toMatchObject({ role: "editor", author: { id: member.authorId } });
    expect(await directory.list()).toEqual([{ ...member, status: "active", userId: "user-mario" }]);
  });

  it("refuses the same address twice without leaving an author behind", async () => {
    await directory.invite({ email: "a@example.com", role: "editor", name: "Ada" });
    await expect(directory.invite({ email: "A@EXAMPLE.COM", role: "admin", name: "Ada Two" })).rejects.toThrow(teamMessages.alreadyMember);
    expect(await count("authors")).toBe(1);
    expect(await count("editors")).toBe(1);
  });

  it("changes a role, and reports an unknown member as null", async () => {
    const { member } = await directory.invite({ email: "a@example.com", role: "editor", name: "Ada" });
    expect(await directory.setRole(member.id, "admin")).toMatchObject({ id: member.id, role: "admin" });
    expect(await directory.setRole("missing", "admin")).toBeNull();
  });

  it("keeps the last signed-in admin: no demotion and no removal, even if the service is bypassed", async () => {
    await signedInAdmin("boss@example.com", "user-boss");
    const [boss] = await directory.list();
    await expect(directory.setRole(boss!.id, "editor")).rejects.toThrow(teamMessages.lastAdmin);
    await expect(directory.remove(boss!.id)).rejects.toThrow(teamMessages.lastAdmin);
    expect((await directory.list())[0]).toMatchObject({ role: "admin" });

    // An admin who never signed in is no way back in, so it does not make the other one removable.
    await directory.invite({ email: "pending@example.com", role: "admin", name: "Pending" });
    await expect(directory.setRole(boss!.id, "editor")).rejects.toThrow(teamMessages.lastAdmin);

    await signedInAdmin("second@example.com", "user-second");
    expect(await directory.setRole(boss!.id, "editor")).toMatchObject({ role: "editor" });
  });

  it("removes access and the author of someone who wrote nothing, but keeps an author with articles", async () => {
    const quiet = (await directory.invite({ email: "quiet@example.com", role: "editor", name: "Quiet" })).member;
    expect(await directory.remove(quiet.id)).toBe(true);
    expect(await directory.remove(quiet.id)).toBe(false);
    expect(await count("authors")).toBe(0);

    const writer = (await directory.invite({ email: "writer@example.com", role: "editor", name: "Writer" })).member;
    const category = "category-1";
    const now = new Date().toISOString();
    await store.database.batch([
      store.database.prepare("INSERT INTO categories (id, translation_key, locale, slug, name, description, position, created_at) VALUES (?, 'news', 'en', 'news', 'News', '', 0, ?)").bind(category, now),
      store.database.prepare(
        `INSERT INTO articles (id, translation_key, locale, slug, title, excerpt, content, cover_image, cover_alt, status, category_id, author_id, featured, reading_minutes, created_at, updated_at)
         VALUES ('article-1', 'story', 'en', 'story', 'A story with a title', 'An excerpt long enough to pass the check.', 'Content that is long enough to pass.', '/media/x.webp', 'Alt text', 'draft', ?, ?, 0, 1, ?, ?)`,
      ).bind(category, writer.authorId, now, now),
    ]);
    expect(await directory.remove(writer.id)).toBe(true);
    expect(await count("editors")).toBe(0);
    expect(await count("authors")).toBe(1);
    await store.database.prepare("DELETE FROM articles").run();
  });

  it("applies the team rules through the service on a real database", async () => {
    await signedInAdmin("boss@example.com", "user-boss");
    const service = new TeamService(directory);
    const { member } = await service.invite({ email: " New.Editor@Example.com " });
    expect(member).toMatchObject({ email: "new.editor@example.com", authorName: "new.editor", role: "editor" });
    await expect(service.invite({ email: "BOSS@example.com" })).rejects.toThrow(teamMessages.alreadyMember);
    const boss = (await service.list()).find((item) => item.email === "boss@example.com")!;
    await expect(service.remove(boss.id, { subject: "user-boss" })).rejects.toThrow(teamMessages.removeSelf);
    await service.remove(member.id, { subject: "user-boss" });
    expect(await service.list()).toHaveLength(1);
  });
});
