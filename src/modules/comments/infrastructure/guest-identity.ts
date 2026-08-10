import "server-only";

import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getCommentEnvironment } from "@/config/env";
import { getRequestNetworkAddress } from "@/lib/request-network";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CommentActor } from "../domain/comment";
import {
  createGuestToken,
  deriveCommentIdentityHash,
  verifyGuestToken,
} from "./identity-token";

export const commentGuestCookieName = "neura_comment_guest";

export type ResolvedCommentActor = {
  actor: CommentActor;
  guestCookie: { value: string; expiresAt: number } | null;
};

export async function resolveCommentActor(request: NextRequest): Promise<ResolvedCommentActor | null> {
  const environment = getCommentEnvironment();
  if (!environment) return null;

  const client = await createServerSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getUser();
  const networkRateHash = deriveCommentIdentityHash(
    environment.guestSecret,
    "network",
    getRequestNetworkAddress(request.headers),
  );
  const existingGuest = verifyGuestToken(
    request.cookies.get(commentGuestCookieName)?.value,
    environment.guestSecret,
  );
  const existingGuestOwnerHash = existingGuest
    ? deriveCommentIdentityHash(environment.guestSecret, "guest-owner", existingGuest.id)
    : null;

  if (data.user?.id) {
    return {
      actor: {
        kind: "authenticated",
        userId: data.user.id,
        guestHash: null,
        guestOwnerHash: existingGuestOwnerHash,
        actorRateHash: deriveCommentIdentityHash(
          environment.guestSecret,
          "authenticated",
          data.user.id,
        ),
        networkRateHash,
      },
      guestCookie: null,
    };
  }

  const token = existingGuest
    ? null
    : createGuestToken(environment.guestSecret, Date.now(), randomUUID());
  const guestId = existingGuest?.id ?? token!.id;
  const guestOwnerHash = existingGuestOwnerHash
    ?? deriveCommentIdentityHash(environment.guestSecret, "guest-owner", guestId);

  return {
    actor: {
      kind: "guest",
      userId: null,
      guestHash: guestOwnerHash,
      guestOwnerHash,
      actorRateHash: deriveCommentIdentityHash(environment.guestSecret, "guest-rate", guestId),
      networkRateHash,
    },
    guestCookie: token ? { value: token.value, expiresAt: token.expiresAt } : null,
  };
}

export function attachCommentGuestCookie(
  response: NextResponse,
  resolved: ResolvedCommentActor,
) {
  if (!resolved.guestCookie) return response;

  response.cookies.set(commentGuestCookieName, resolved.guestCookie.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(resolved.guestCookie.expiresAt),
    priority: "high",
  });
  return response;
}
