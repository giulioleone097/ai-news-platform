import "server-only";

import { cookies } from "next/headers";
import { readSessionToken } from "@atlasnews/adapters/auth/session";
import { getOAuthSignInEnvironment } from "@atlasnews/adapters/config/env";
import { authCookieNames } from "./cookies";
import type { SignedInUser } from "./signed-in-user";

/**
 * The person signed in with our own Google or GitHub session cookie (`sites` and `demo`), or null: no
 * cookie, a forged or expired one, or a provider that is no longer configured.
 */
export async function getOwnSessionUser(): Promise<SignedInUser | null> {
  const environment = getOAuthSignInEnvironment();
  if (!environment) return null;
  const token = (await cookies()).get(authCookieNames().session)?.value;
  const session = await readSessionToken(token, environment.sessionSecret);
  if (!session || !(session.provider in environment.providers)) return null;
  return { userId: session.sub, email: session.email, name: session.name, provider: session.provider };
}
