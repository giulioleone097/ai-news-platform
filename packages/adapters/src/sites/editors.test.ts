import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => vi.unstubAllEnvs());

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

  it("ignores the identity headers while ChatGPT sign-in is switched off", () => {
    const headers = new Headers({ "oai-authenticated-user-id": "abc", "oai-authenticated-user-email": "a@b.co" });
    vi.stubEnv("ATLASNEWS_CHATGPT_SIGN_IN", "off");
    expect(readSitesIdentity(headers)).toBeNull();
    vi.stubEnv("ATLASNEWS_CHATGPT_SIGN_IN", "");
    expect(readSitesIdentity(headers)).toEqual({ userId: "abc", email: "a@b.co", fullName: null });
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

  it("recognises the same person by verified email whichever provider signs them in", async () => {
    const options = { adminEmails: ["owner@example.com"] };
    const withChatGPT = await resolveSitesEditor(store.database, owner, options);
    const withGoogle = await resolveSitesEditor(store.database, { userId: "google:1042", email: "owner@example.com", fullName: "G. Rossi" }, options);
    const withGitHub = await resolveSitesEditor(store.database, { userId: "github:77", email: "OWNER@EXAMPLE.COM", fullName: null }, options);

    expect(withGoogle).toMatchObject({ userId: "google:1042", role: "admin", author: { id: withChatGPT?.author.id } });
    expect(withGitHub).toMatchObject({ userId: "github:77", role: "admin", author: { id: withChatGPT?.author.id } });
    const counts = await store.database.prepare("SELECT (SELECT count(*) FROM authors) AS authors, (SELECT count(*) FROM editors) AS editors").first();
    expect(counts).toEqual({ authors: 1, editors: 1 });
  });

  it("records the latest user id as information only", async () => {
    const options = { adminEmails: ["owner@example.com"] };
    await resolveSitesEditor(store.database, owner, options);
    expect((await store.database.prepare("SELECT user_id FROM editors").first())?.user_id).toBe("user-owner");

    await resolveSitesEditor(store.database, { userId: "google:1042", email: "owner@example.com", fullName: null }, options);
    expect((await store.database.prepare("SELECT user_id FROM editors").first())?.user_id).toBe("google:1042");
    // The old id no longer matters: it grants nothing without the email.
    expect(await resolveSitesEditor(store.database, { userId: "google:1042", email: "other@example.com", fullName: null }, options)).toBeNull();
    expect(await resolveSitesEditor(store.database, { userId: "user-owner", email: "other@example.com", fullName: null })).toBeNull();
  });

  it("does not fail when the user id already belongs to another editor row", async () => {
    const options = { adminEmails: ["owner@example.com"], editorEmails: ["mario@example.com"] };
    await resolveSitesEditor(store.database, { userId: "google:9", email: "mario@example.com", fullName: null }, options);
    // Mario changes the email of his Google account to the owner's address: same user id, other row.
    const second = await resolveSitesEditor(store.database, { userId: "google:9", email: "owner@example.com", fullName: null }, options);
    expect(second).toMatchObject({ role: "admin" });
    const holders = await store.database.prepare("SELECT email FROM editors WHERE user_id = 'google:9'").all();
    expect(holders.results).toEqual([{ email: "mario@example.com" }]);
  });

  it("keeps an invitation (an email, an author and no user id) working for every provider", async () => {
    const now = new Date().toISOString();
    await store.database.batch([
      store.database.prepare("INSERT INTO authors (id, name, role, initials, created_at) VALUES ('author-1', 'Mario Bianchi', 'Editor', 'MB', ?)").bind(now),
      store.database.prepare("INSERT INTO editors (id, email, author_id, role, created_at, updated_at) VALUES ('e1', 'mario@example.com', 'author-1', 'editor', ?, ?)").bind(now, now),
    ]);
    const viaGitHub = { userId: "github:5", email: "MARIO@example.com", fullName: null };
    expect(await resolveSitesEditor(store.database, viaGitHub)).toMatchObject({ role: "editor", author: { id: "author-1" } });
    expect((await store.database.prepare("SELECT user_id FROM editors WHERE id = 'e1'").first())?.user_id).toBe("github:5");
    expect(await resolveSitesEditor(store.database, { ...viaGitHub, userId: "oai-mario" })).toMatchObject({ userId: "oai-mario", author: { id: "author-1" } });
    expect(await resolveSitesEditor(store.database, { userId: "github:6", email: "someone@example.com", fullName: null })).toBeNull();
  });

  it("does not let a bootstrap address create a second row when a request lost the race", async () => {
    const options = { adminEmails: ["owner@example.com"] };
    const [first, second] = await Promise.all([
      resolveSitesEditor(store.database, owner, options),
      resolveSitesEditor(store.database, { userId: "google:1", email: "owner@example.com", fullName: null }, options),
    ]);
    expect(first?.author.id).toBe(second?.author.id);
    const counts = await store.database.prepare("SELECT (SELECT count(*) FROM authors) AS authors, (SELECT count(*) FROM editors) AS editors").first();
    expect(counts).toEqual({ authors: 1, editors: 1 });
  });
});
