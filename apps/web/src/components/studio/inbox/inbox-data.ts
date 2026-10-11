import "server-only";

import {
  contactMessageStatuses,
  type ContactMessagePage,
  type ContactMessageStatus,
} from "@atlasnews/core/support/domain/contact-message";
import { ContactMessageError } from "@atlasnews/core/support/application/contact-service";
import { getStudioContactMessageService } from "@/server/composition";

export type InboxResult =
  | { ok: true; page: ContactMessagePage; newCount: number }
  | { ok: false; reason: "unavailable" | "failed" };

export function parseInboxStatus(value: string | undefined): ContactMessageStatus | undefined {
  return contactMessageStatuses.find((status) => status === value);
}

/** One page of the inbox plus how many messages are new. A stale cursor starts again from the newest message. */
export async function loadInbox(input: { status?: ContactMessageStatus; cursor?: string }): Promise<InboxResult> {
  try {
    const service = await getStudioContactMessageService();
    if (!service) return { ok: false, reason: "unavailable" };
    const [page, newCount] = await Promise.all([
      service.list(input).catch((error: unknown) => {
        if (error instanceof ContactMessageError && error.code === "invalid_cursor") return service.list({ status: input.status });
        throw error;
      }),
      service.countNew(),
    ]);
    return { ok: true, page, newCount };
  } catch (error) {
    console.error("studio inbox: could not be loaded", error);
    return { ok: false, reason: "failed" };
  }
}

/**
 * How many contact messages still wait for an answer, for the dashboard. Zero when the inbox is not
 * configured or cannot be read, so a missing inbox never breaks the page that shows the number.
 */
export async function countNewContactMessages() {
  try {
    return (await (await getStudioContactMessageService())?.countNew()) ?? 0;
  } catch {
    return 0;
  }
}
