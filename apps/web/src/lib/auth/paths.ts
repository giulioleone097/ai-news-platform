import type { OAuthProviderId } from "@atlasnews/adapters/auth/oauth";
import { safeReturnPath } from "./return-path";

/** Every way to sign in; `email` is Supabase's email and password. */
export type SignInProvider = "chatgpt" | OAuthProviderId | "email";

/**
 * ChatGPT sign-in and sign-out belong to the Sites platform. They must start as a top-level navigation
 * (a plain link or form with `target="_top"`), never a fetch or a client-side route change.
 */
export function chatGPTSignInPath(returnTo: string) {
  return `/signin-with-chatgpt?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`;
}

export function chatGPTSignOutPath(returnTo: string) {
  return `/signout-with-chatgpt?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`;
}

/** Where a link or button starts signing in with one of the providers that redirect (not email). */
export function signInPath(provider: "chatgpt" | OAuthProviderId, returnTo: string) {
  return provider === "chatgpt"
    ? chatGPTSignInPath(returnTo)
    : `/api/auth/${provider}/start?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`;
}

/**
 * Where a form POSTs to sign out of the account that signed in with `provider`: the platform for ChatGPT,
 * `POST /api/auth/signout` for our own session (and Supabase's).
 */
export function signOutPath(provider: SignInProvider, returnTo: string) {
  return provider === "chatgpt"
    ? chatGPTSignOutPath(returnTo)
    : `/api/auth/signout?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`;
}
