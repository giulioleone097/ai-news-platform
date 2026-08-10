import { describe, expect, it } from "vitest";

import { publicSocialOutboxJob } from "../domain/social-publication";
import { mapSocialOutboxJob } from "./supabase-social-outbox-repository";

describe("Supabase social outbox mapping", () => {
  it("carries the provider event timestamp into the public readback", () => {
    const job = mapSocialOutboxJob({
      id: "fc7c6331-56a3-42dc-8932-6b4394bc4c9f",
      publication_id: "9b984e7b-1aa8-4f2a-bd9b-f799f4b7529e",
      provider: "whatsapp",
      idempotency_key: "social:whatsapp:5e9f62b40cc1470cb41e67d9e77c2565",
      payload: { text: "Private briefing", recipient: "15551234567" },
      status: "sent",
      attempts: 1,
      max_attempts: 5,
      available_at: "2026-08-10T07:59:00.000Z",
      lease_token: null,
      lease_expires_at: null,
      dispatch_started_at: "2026-08-10T07:59:30.000Z",
      provider_message_id: "wamid.HBgMNTU1MTIzNDU2NzgVAgARGBI5",
      provider_url: null,
      provider_status: "delivered",
      provider_status_at: "2026-08-10T08:00:00.000Z",
      revision: 4,
      retry_safe: false,
      last_error_code: null,
      last_error_message: null,
      sent_at: "2026-08-10T07:59:31.000Z",
      failed_at: null,
      delivered_at: "2026-08-10T08:00:00.000Z",
      read_at: null,
      created_at: "2026-08-10T07:59:00.000Z",
      updated_at: "2026-08-10T08:00:00.000Z",
    });

    expect(job.providerStatusAt).toBe("2026-08-10T08:00:00.000Z");
    expect(publicSocialOutboxJob(job)).toMatchObject({
      providerStatus: "delivered",
      providerStatusAt: "2026-08-10T08:00:00.000Z",
      revision: 4,
    });
  });
});
