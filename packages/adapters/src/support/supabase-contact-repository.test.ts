import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { ContactMessage } from "@atlasnews/core/support/domain/contact-message";
import { SupabaseContactMessageRepository } from "./supabase-contact-repository";

const message: ContactMessage = {
  id: "6f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e6f",
  locale: "en",
  name: "Ada Lovelace",
  email: "ada@example.com",
  subject: "A correction",
  body: "The article names the wrong model.",
  status: "new",
  createdAt: "2026-10-11T10:00:00.000Z",
};

describe("SupabaseContactMessageRepository", () => {
  it("stores through the rate-limited function and reads its verdict", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: "created", error: null }).mockResolvedValueOnce({ data: "rate_limited", error: null });
    const repository = new SupabaseContactMessageRepository({ rpc } as unknown as SupabaseClient);
    const requesterKey = "a".repeat(64);

    expect(await repository.create({ message, requesterKey })).toBe("created");
    expect(await repository.create({ message, requesterKey })).toBe("rate_limited");
    expect(rpc).toHaveBeenCalledWith("submit_contact_message", {
      p_id: message.id,
      p_locale: "en",
      p_name: "Ada Lovelace",
      p_email: "ada@example.com",
      p_subject: "A correction",
      p_body: "The article names the wrong model.",
      p_request_fingerprint: requesterKey,
    });
  });

  it("fails loudly when the function errors", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "permission denied" } });
    const repository = new SupabaseContactMessageRepository({ rpc } as unknown as SupabaseClient);
    await expect(repository.create({ message, requesterKey: "a".repeat(64) })).rejects.toThrow("permission denied");
  });

  it("pages after a keyset cursor and reads one row more than the limit", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          { id: message.id, locale: "en", name: "Ada", email: "ada@example.com", subject: "S1", body: "Body one.", status: "new", created_at: "2026-10-11T10:00:00.123456+00:00" },
          { id: "7f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e6f", locale: "it", name: "Grace", email: "g@example.com", subject: "S2", body: "Body two.", status: "new", created_at: "2026-10-11T09:00:00+00:00" },
        ],
        error: null,
      }),
    };
    const from = vi.fn().mockReturnValue(query);
    const repository = new SupabaseContactMessageRepository({ from } as unknown as SupabaseClient);

    const page = await repository.list({
      status: "new",
      cursor: { createdAt: "2026-10-11T11:00:00.000Z", id: "8f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e6f" },
      limit: 1,
    });

    expect(from).toHaveBeenCalledWith("contact_messages");
    expect(query.eq).toHaveBeenCalledWith("status", "new");
    expect(query.or).toHaveBeenCalledWith(
      "created_at.lt.2026-10-11T11:00:00.000Z,and(created_at.eq.2026-10-11T11:00:00.000Z,id.lt.8f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e6f)",
    );
    expect(query.limit).toHaveBeenCalledWith(2);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].createdAt).toBe("2026-10-11T10:00:00.123Z");
    expect(page.nextCursor).not.toBeNull();
  });
});

describe("contact_messages migration", () => {
  const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261015100000_contact_messages.sql"), "utf8");

  it("keeps the inbox away from anon and authenticated", () => {
    for (const table of ["contact_messages", "contact_request_limits"]) {
      expect(migration).toContain(`alter table public.${table} force row level security;`);
    }
    expect(migration).toContain("revoke all on public.contact_messages, public.contact_request_limits from public, anon, authenticated;");
    expect(migration).not.toMatch(/grant [^;]*to (anon|authenticated)/iu);
    expect(migration).not.toMatch(/create policy [^;]*to (anon|authenticated)/iu);
  });

  it("lets only the service role submit, through the security-definer function", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("revoke all on function public.submit_contact_message(uuid, text, text, text, text, text, text)\n  from public, anon, authenticated;");
    expect(migration).toContain("to service_role");
    expect(migration).not.toMatch(/grant [^;]*insert[^;]*on public\.contact_messages/iu);
  });
});
