import { describe, expect, it } from "vitest";
import { ContactMessageError, ContactMessageService } from "@atlasnews/core/support/application/contact-service";
import { contactPolicy } from "@atlasnews/core/support/domain/contact-message";
import { MemoryContactRepository } from "./memory-contact-repository";

const request = {
  locale: "it",
  name: "Grace Hopper",
  email: "Grace@Example.com",
  subject: "Una segnalazione",
  body: "Nel secondo paragrafo manca il nome del modello citato.",
};

function service(now = () => Date.parse("2026-10-11T10:00:00.000Z")) {
  return new ContactMessageService(new MemoryContactRepository(now));
}

describe("ContactMessageService", () => {
  it("validates, stores as new and lists", async () => {
    const contact = service();
    await expect(contact.submit({ ...request, email: "nope" }, { requester: "203.0.113.7" })).rejects.toThrow();
    expect(await contact.submit({ ...request, website: "ignored" }, { requester: "203.0.113.7" })).toBe("accepted");

    const [stored] = (await contact.list()).items;
    expect(stored).toMatchObject({ email: "grace@example.com", locale: "it", status: "new" });
    expect(stored).not.toHaveProperty("website");
    expect(await contact.countNew()).toBe(1);
  });

  it("limits a requester, then the site, per window", async () => {
    let now = Date.parse("2026-10-11T10:00:00.000Z");
    const contact = service(() => now);
    for (let index = 0; index < contactPolicy.requesterLimit; index += 1) {
      expect(await contact.submit(request, { requester: "203.0.113.7" })).toBe("accepted");
    }
    expect(await contact.submit(request, { requester: "203.0.113.7" })).toBe("rate_limited");
    expect(await contact.submit(request, { requester: "203.0.113.8" })).toBe("accepted");

    now += contactPolicy.requesterWindowMinutes * 60_000;
    expect(await contact.submit(request, { requester: "203.0.113.7" })).toBe("accepted");
  });

  it("moves a message between statuses, deletes it, and reports unknown ids and bad cursors", async () => {
    const contact = service();
    await contact.submit(request, { requester: "203.0.113.7" });
    const [{ id }] = (await contact.list()).items;

    await contact.setStatus(id, "handled");
    expect(await contact.countNew()).toBe(0);
    expect((await contact.list({ status: "handled" })).items).toHaveLength(1);

    await contact.delete(id);
    await expect(contact.delete(id)).rejects.toMatchObject({ code: "not_found" });
    await expect(contact.setStatus(crypto.randomUUID(), "archived")).rejects.toBeInstanceOf(ContactMessageError);
    await expect(contact.list({ cursor: "garbage" })).rejects.toMatchObject({ code: "invalid_cursor" });
  });
});
