import type { SignInProvider } from "./paths";

/** Whoever is signed in, editor or not, and however they signed in. */
export interface SignedInUser {
  userId: string;
  email: string | null;
  name: string | null;
  provider: SignInProvider;
}

/** What a reader is called in a comment form: their name, else the part of the email before the @. */
export function readerDisplayName(user: Pick<SignedInUser, "email" | "name">) {
  const name = user.name?.trim() || user.email?.split("@")[0]?.trim() || "";
  return name.slice(0, 60);
}
