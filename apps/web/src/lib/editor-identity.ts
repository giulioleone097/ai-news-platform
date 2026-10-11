import type { Author } from "@atlasnews/core/editorial/domain/article";

/** The editor signed in to the Studio, whichever backend signed them in. */
export interface EditorIdentity {
  userId: string;
  role: "editor" | "admin";
  author: Author;
  isDemo: boolean;
}
