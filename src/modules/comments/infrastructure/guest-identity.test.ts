import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import {
  createGuestToken,
  deriveCommentIdentityHash,
} from "./identity-token";
import {
  commentGuestCookieName,
  resolveCommentActor,
} from "./guest-identity";

const guestSecret = "test-comment-secret-that-is-longer-than-thirty-two-bytes";
const guestId = "f0d16765-a03d-4c55-9e1c-fd6c6c87557f";
const userId = "c1bc5fb2-1e4a-447d-b0a6-5481bacf2d35";
const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/config/env", () => ({
  getCommentEnvironment: () => ({
    guestSecret: "test-comment-secret-that-is-longer-than-thirty-two-bytes",
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

describe("resolveCommentActor", () => {
  it("keeps the signed guest ownership fallback after authentication", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: userId } } });
    const token = createGuestToken(guestSecret, Date.now(), guestId);
    const request = new NextRequest("https://neura.test/api/comments", {
      headers: { cookie: `${commentGuestCookieName}=${token.value}` },
    });

    const resolved = await resolveCommentActor(request);

    expect(resolved?.actor).toMatchObject({
      kind: "authenticated",
      userId,
      guestHash: null,
      guestOwnerHash: deriveCommentIdentityHash(guestSecret, "guest-owner", guestId),
    });
    expect(resolved?.guestCookie).toBeNull();
  });
});
