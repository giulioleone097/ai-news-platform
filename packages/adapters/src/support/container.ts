import { ContactMessageService } from "@atlasnews/core/support/application/contact-service";
import { getContentMode } from "../config/env";
import { requireSitesBindings } from "../sites/bindings";
import { createServiceSupabaseClient } from "../supabase/service";
import { D1ContactMessageRepository } from "./d1-contact-repository";
import { MemoryContactRepository } from "./memory-contact-repository";
import { SupabaseContactMessageRepository } from "./supabase-contact-repository";

// The demo inbox lives as long as the process, shared by every module graph like the demo editorial data.
const globalForAtlasNews = globalThis as typeof globalThis & { __atlasnewsMemoryContact?: MemoryContactRepository };

/**
 * The contact inbox: the Site's D1 database, the service-role Supabase client, or memory in the demo mode.
 * Null when Supabase is selected without the service-role key. The caller decides who may use it: the
 * contact form only submits, the Studio and the MCP tools check for a signed-in editor first.
 */
export function getContactMessageService() {
  const mode = getContentMode();
  if (mode === "sites") return new ContactMessageService(new D1ContactMessageRepository(requireSitesBindings().database));
  if (mode === "supabase") {
    const client = createServiceSupabaseClient();
    return client ? new ContactMessageService(new SupabaseContactMessageRepository(client)) : null;
  }
  globalForAtlasNews.__atlasnewsMemoryContact ??= new MemoryContactRepository();
  return new ContactMessageService(globalForAtlasNews.__atlasnewsMemoryContact);
}
