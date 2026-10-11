import type { EditorDirectory } from "@atlasnews/core/team/domain/ports";
import type { TeamMember } from "@atlasnews/core/team/domain/team";
import { getContentMode, getPublicSiteUrl, isDemoStudioEnabled } from "../config/env";
import { seedAuthor } from "../editorial/seed";
import { requireSitesBindings } from "../sites/bindings";
import { createServiceSupabaseClient } from "../supabase/service";
import { D1EditorDirectory } from "./d1-editor-directory";
import { MemoryEditorDirectory } from "./memory-editor-directory";
import { SupabaseEditorDirectory } from "./supabase-editor-directory";

/** The demo Studio signs in everyone as this admin (`getCurrentEditor` in the web app). */
const demoAdmin: TeamMember = {
  id: "demo-editor",
  email: "demo@atlasnews.example",
  role: "admin",
  authorId: seedAuthor.id,
  authorName: seedAuthor.name,
  status: "active",
  userId: "demo-editor",
};

const globalForAtlasNews = globalThis as typeof globalThis & { __atlasnewsMemoryEditorDirectory?: MemoryEditorDirectory };

/**
 * The team of the configured backend. Every backend runs with full access (D1 has no row-level security
 * and Supabase needs the service-role key to invite), so the caller must have checked that the person
 * is an admin; the Studio and the MCP server do, through the `newsroom.admin` scope.
 */
export function getEditorDirectory(): EditorDirectory {
  const mode = getContentMode();
  if (mode === "sites") return new D1EditorDirectory(requireSitesBindings().database);
  if (mode === "demo") {
    if (!isDemoStudioEnabled()) throw new Error("Team management is not configured.");
    globalForAtlasNews.__atlasnewsMemoryEditorDirectory ??= new MemoryEditorDirectory([demoAdmin]);
    return globalForAtlasNews.__atlasnewsMemoryEditorDirectory;
  }
  const client = createServiceSupabaseClient();
  if (!client) throw new Error("Team management needs the Supabase service-role key.");
  return new SupabaseEditorDirectory(client, new URL("/en/auth/callback", getPublicSiteUrl()).href);
}
