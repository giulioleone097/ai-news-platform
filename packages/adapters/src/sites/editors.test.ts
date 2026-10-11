import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readSitesIdentity, resolveSitesEditor, type SitesIdentity } from "./editors";
import { createSitesTestStore, type SitesTestStore } from "./testing";

const reader: SitesIdentity = { userId: "user-reader", email: "reader@example.com", fullName: null };
const owner: SitesIdentity = { userId: "user-owner", email: "Owner@Example.com", fullName: "Giulia Rossi" };

describe("Sites editors", () => {
  let store: SitesTestStore;
  beforeAll(async () => {
    store = await createSitesTestStore();
  });
  afterAll(() => store.dispose());
  beforeEach(async () => {
    await store.database.batch([store.database.prepare("DELETE FROM editors"), store.database.prepare("DELETE FROM authors")]);
  });

  it("reads the identity headers the platform injects and decodes the full name", () => {
    const headers = new Headers({
      "oai-authenticated-user-id": "abc",
      "oai-authenticated-user-email": "a@b.co",
      "oai-authenticated-user-full-name": "Jos%C3%A9",
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
    });
    expect(readSitesIdentity(headers)).toEqual({ userId: "abc", email: "a@b.co", fullName: "José" });
    expect(readSitesIdentity(new Headers({ "oai-authenticated-user-email": "a@b.co" }))).toBeNull();
  });

  it("gives a reader no editor profile", async () => {
    expect(await resolveSitesEditor(store.database, reader, { adminEmails: ["owner@example.com"] })).toBeNull();
  });

  it("makes a bootstrap address an admin once, with its own author", async () => {
    const first = await resolveSitesEditor(store.database, owner, { adminEmails: ["owner@example.com"] });
    expect(first).toMatchObject({ userId: "user-owner", role: "admin", author: { name: "Giulia Rossi", initials: "GR" } });
    const again = await resolveSitesEditor(store.database, owner, { adminEmails: ["owner@example.com"] });
    expect(again?.author.id).toBe(first?.author.id);
    const counts = await store.database.prepare("SELECT (SELECT count(*) FROM authors) AS authors, (SELECT count(*) FROM editors) AS editors").first();
    expect(counts).toEqual({ authors: 1, editors: 1 });
  });

  it("makes a listed editor address an editor, and admin wins when an address is in both lists", async () => {
    const editor = await resolveSitesEditor(store.database, reader, { editorEmails: [reader.email] });
    expect(editor).toMatchObject({ role: "editor" });
    const admin = await resolveSitesEditor(store.database, owner, { adminEmails: [owner.email], editorEmails: [owner.email] });
    expect(admin).toMatchObject({ role: "admin" });
  });

  it("does not let another account with the bootstrap email take over a bound admin", async () => {
    await resolveSitesEditor(store.database, owner, { adminEmails: ["owner@example.com"] });
    const impostor = { ...owner, userId: "someone-else" };
    expect(await resolveSitesEditor(store.database, impostor, { adminEmails: ["owner@example.com"] })).toBeNull();
  });

  it("binds an invitation to the first account that signs in with its email", async () => {
    const now = new Date().toISOString();
    await store.database.batch([
      store.database.prepare("INSERT INTO authors (id, name, role, initials, created_at) VALUES ('author-1', 'Mario Bianchi', 'Editor', 'MB', ?)").bind(now),
      store.database.prepare("INSERT INTO editors (id, email, author_id, role, created_at, updated_at) VALUES ('e1', 'mario@example.com', 'author-1', 'editor', ?, ?)").bind(now, now),
    ]);
    const mario = { userId: "user-mario", email: "MARIO@example.com", fullName: null };
    expect(await resolveSitesEditor(store.database, mario)).toMatchObject({ role: "editor", author: { id: "author-1" } });
    expect(await resolveSitesEditor(store.database, { ...mario, userId: "user-other" })).toBeNull();
  });
});
