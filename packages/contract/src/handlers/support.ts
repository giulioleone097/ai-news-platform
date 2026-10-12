import { ContactMessageError } from "@atlasnews/core/support/application/contact-service";

import { CapabilityFailure, implement } from "../capability";
import {
  adminDeleteContactMessage,
  adminDeleteContactMessages,
  adminGetContactMessage,
  adminListContactMessages,
  adminUpdateContactMessage,
  adminUpdateContactMessages,
} from "../specs/support";
import { markUntrusted } from "../untrusted";

/** An unknown id or a bad cursor is the caller's mistake, with a message that is safe to show. */
async function expected<T>(work: Promise<T>) {
  try {
    return await work;
  } catch (error) {
    if (error instanceof ContactMessageError) throw new CapabilityFailure(error.message);
    throw error;
  }
}

/** The contact inbox: messages that visitors typed into the form at /support. */
export const supportCapabilities = [
  implement(adminListContactMessages, async (ports, input) => {
    const page = await expected((await ports.contact()).list(input));
    return markUntrusted({ items: page.items.map((item) => ({ ...item })), nextCursor: page.nextCursor }, [
      "items[].name",
      "items[].email",
      "items[].subject",
      "items[].body",
    ]);
  }),

  implement(adminGetContactMessage, async (ports, { id }) => markUntrusted(
    { message: { ...await expected((await ports.contact()).get(id)) } },
    ["message.name", "message.email", "message.subject", "message.body"],
  )),

  implement(adminUpdateContactMessage, async (ports, { id, status }) => {
    await expected((await ports.contact()).setStatus(id, status));
    return { id, status };
  }),

  implement(adminUpdateContactMessages, async (ports, { ids, status }) => {
    await (await ports.contact()).setStatusMany(ids, status);
    return { count: ids.length, items: ids.map((id, index) => ({ index, action: "updated" as const, id, status })) };
  }),

  implement(adminDeleteContactMessage, async (ports, { id }) => {
    await expected((await ports.contact()).delete(id));
    return { deletedId: id };
  }),

  implement(adminDeleteContactMessages, async (ports, { ids }) => {
    await (await ports.contact()).deleteMany(ids);
    return { count: ids.length, items: ids.map((id, index) => ({ index, action: "deleted" as const, id })) };
  }),
];
