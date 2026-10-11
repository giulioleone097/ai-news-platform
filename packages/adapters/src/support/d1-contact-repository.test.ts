import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactMessageService, contactRequesterKey } from "@atlasnews/core/support/application/contact-service";
import { contactPolicy, type ContactMessage } from "@atlasnews/core/support/domain/contact-message";
import { createSitesTestStore, type SitesTestStore } from "../sites/testing";
import { D1ContactMessageRepository } from "./d1-contact-repository";

let store: SitesTestStore;
let repository: D1ContactMessageRepository;

beforeAll(async () => {
  store = await createSitesTestStore();
  repository = new D1ContactMessageRepository(store.database);
});

afterAll(async () => {
  await store.dispose();
});

beforeEach(async () => {
  await store.database.batch([
    store.database.prepare("DELETE FROM contact_messages"),
    store.database.prepare("DELETE FROM contact_request_limits"),
  ]);
});

const sender = contactRequesterKey("203.0.113.7");

function message(overrides: Partial<ContactMessage> = {}): ContactMessage {
  return {
    id: crypto.randomUUID(),
    locale: "en",
    name: "Ada Lovelace",
    email: "ada@example.com",
    subject: "A correction",
    body: "The article names the wrong model in its second paragraph.",
    status: "new",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function limits() {
  const { results } = await store.database
    .prepare("SELECT scope_key, request_count FROM contact_request_limits ORDER BY scope_key")
    .all<{ scope_key: string; request_count: number }>();
  return Object.fromEntries(results.map((row) => [row.scope_key === "global" ? "global" : "requester", row.request_count]));
}

describe("D1ContactMessageRepository", () => {
  it("stores a message and lists it newest first with its status", async () => {
    const older = message({ subject: "Older", createdAt: "2026-10-11T10:00:00.000Z" });
    const newer = message({ subject: "Newer", createdAt: "2026-10-11T10:00:01.000Z", locale: "it" });
    expect(await repository.create({ message: older, requesterKey: sender })).toBe("created");
    expect(await repository.create({ message: newer, requesterKey: sender })).toBe("created");

    const page = await repository.list({ status: null, cursor: null, limit: 10 });

    expect(page.items).toEqual([newer, older]);
    expect(page.nextCursor).toBeNull();
    expect(await limits()).toEqual({ requester: 2, global: 2 });
  });

  it("filters by status, counts, and pages with a cursor", async () => {
    const ids: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const next = message({ createdAt: `2026-10-11T10:00:0${index}.000Z`, subject: `Message ${index}` });
      ids.push(next.id);
      await repository.create({ message: next, requesterKey: contactRequesterKey(`198.51.100.${index}`) });
    }
    await repository.setStatus(ids[1], "handled");
    await repository.setStatus(ids[3], "archived");

    expect(await repository.count("new")).toBe(3);
    expect((await repository.list({ status: "handled", cursor: null, limit: 10 })).items.map((item) => item.id)).toEqual([ids[1]]);

    const service = new ContactMessageService(repository);
    const first = await service.list({ limit: 2 });
    expect(first.items.map((item) => item.subject)).toEqual(["Message 4", "Message 3"]);
    expect(first.nextCursor).not.toBeNull();
    const second = await service.list({ limit: 2, cursor: first.nextCursor! });
    expect(second.items.map((item) => item.subject)).toEqual(["Message 2", "Message 1"]);
    const last = await service.list({ limit: 2, cursor: second.nextCursor! });
    expect(last.items.map((item) => item.subject)).toEqual(["Message 0"]);
    expect(last.nextCursor).toBeNull();
  });

  it("keeps rows of the same instant apart in the cursor", async () => {
    const createdAt = "2026-10-11T10:00:00.000Z";
    for (let index = 0; index < 3; index += 1) {
      await repository.create({ message: message({ createdAt }), requesterKey: contactRequesterKey(`198.51.100.${index}`) });
    }
    const seen = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await new ContactMessageService(repository).list({ limit: 1, cursor });
      for (const item of page.items) seen.add(item.id);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen.size).toBe(3);
  });

  it("changes the status and deletes, and says when the id is unknown", async () => {
    const stored = message();
    await repository.create({ message: stored, requesterKey: sender });

    expect(await repository.setStatus(stored.id, "handled")).toBe(true);
    expect((await repository.list({ status: "handled", cursor: null, limit: 5 })).items).toHaveLength(1);
    expect(await repository.setStatus(crypto.randomUUID(), "archived")).toBe(false);

    expect(await repository.delete(stored.id)).toBe(true);
    expect(await repository.delete(stored.id)).toBe(false);
    expect(await repository.count("handled")).toBe(0);
  });

  it("refuses a sender after its limit, without storing the message, and keeps other senders working", async () => {
    for (let index = 0; index < contactPolicy.requesterLimit; index += 1) {
      expect(await repository.create({ message: message(), requesterKey: sender })).toBe("created");
    }
    const refused = message({ subject: "One too many" });
    expect(await repository.create({ message: refused, requesterKey: sender })).toBe("rate_limited");

    const stored = await repository.list({ status: null, cursor: null, limit: 50 });
    expect(stored.items).toHaveLength(contactPolicy.requesterLimit);
    expect(stored.items.map((item) => item.id)).not.toContain(refused.id);
    // The refused request counted for the sender but not for the site.
    expect(await limits()).toEqual({ requester: contactPolicy.requesterLimit + 1, global: contactPolicy.requesterLimit });

    expect(await repository.create({ message: message(), requesterKey: contactRequesterKey("198.51.100.99") })).toBe("created");
  });

  it("starts a new window once the old one has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-11T10:00:00.000Z"));
      for (let index = 0; index < contactPolicy.requesterLimit; index += 1) {
        await repository.create({ message: message(), requesterKey: sender });
      }
      expect(await repository.create({ message: message(), requesterKey: sender })).toBe("rate_limited");

      vi.setSystemTime(new Date("2026-10-11T10:10:00.000Z"));
      expect(await repository.create({ message: message(), requesterKey: sender })).toBe("created");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops everyone once the site-wide limit is reached", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-11T10:00:00.000Z"));
      for (let index = 0; index < contactPolicy.siteLimit; index += 1) {
        const requesterKey = contactRequesterKey(`10.0.${Math.floor(index / 4)}.${index % 4}`);
        expect(await repository.create({ message: message(), requesterKey })).toBe("created");
      }
      expect(await repository.create({ message: message(), requesterKey: contactRequesterKey("192.0.2.1") })).toBe("rate_limited");
      expect(await repository.count("new")).toBe(contactPolicy.siteLimit);

      vi.setSystemTime(new Date("2026-10-11T11:00:00.000Z"));
      expect(await repository.create({ message: message(), requesterKey: contactRequesterKey("192.0.2.1") })).toBe("created");
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops the sender buckets that have been idle for a day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-11T10:00:00.000Z"));
      await repository.create({ message: message(), requesterKey: sender });
      vi.setSystemTime(new Date("2026-10-13T10:00:00.000Z"));
      await repository.create({ message: message(), requesterKey: contactRequesterKey("198.51.100.5") });
      const { results } = await store.database.prepare("SELECT scope_key FROM contact_request_limits").all<{ scope_key: string }>();
      expect(results.map((row) => row.scope_key)).not.toContain(sender);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects an invalid row in the database itself", async () => {
    await expect(store.database
      .prepare("INSERT INTO contact_messages (id, locale, name, email, subject, body) VALUES (?, 'fr', 'Ada', 'ada@example.com', 'Subject', 'A body that is long enough.')")
      .bind(crypto.randomUUID())
      .run()).rejects.toThrow();
    await expect(store.database
      .prepare("INSERT INTO contact_messages (id, locale, name, email, subject, body) VALUES (?, 'en', 'Ada', 'not an address', 'Subject', 'A body that is long enough.')")
      .bind(crypto.randomUUID())
      .run()).rejects.toThrow();
  });
});
