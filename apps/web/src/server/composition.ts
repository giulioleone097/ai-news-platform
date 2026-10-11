import "server-only";

import {
  getStudioAdminEditorialRepository as composeStudioAdminEditorialRepository,
  getStudioEditorialRepositories as composeStudioEditorialRepositories,
} from "@atlasnews/adapters/editorial/container";
import { getStudioNewsletterCampaignService as composeStudioNewsletterCampaignService } from "@atlasnews/adapters/newsletter/container";
import { getContentMode } from "@atlasnews/adapters/config/env";
import { getContactMessageService } from "@atlasnews/adapters/support/container";
import { getEditorDirectory } from "@atlasnews/adapters/team/container";
import { getEditorIdentity } from "@/lib/editor-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// The only module that lets web code reach the adapters' composition roots; the
// server-only guard keeps them out of client bundles.
export { getPublicEditorialRepositories, readUploadedMedia } from "@atlasnews/adapters/editorial/container";
export * from "@atlasnews/adapters/comments/container";
export { createCommentNotificationPreference } from "@atlasnews/adapters/comments/notification-preference";
export { getNewsletterDeliveryService } from "@atlasnews/adapters/newsletter/container";
export { getContactMessageService } from "@atlasnews/adapters/support/container";
export {
  createSocialPublishingRuntime,
  createWhatsAppWebhookRuntime,
} from "@atlasnews/adapters/social-publishing/runtime";

/** The author that writes of the signed-in editor are attributed to; Supabase reads it from the session itself. */
const editorAuthorId = async () => (await getEditorIdentity())?.author.id ?? null;

/**
 * Supabase checks every Studio query again with RLS. The D1 database has no such layer, so on Sites the
 * Studio repositories are only handed out while an editor is signed in, whatever the caller checked.
 */
async function requireSitesEditor() {
  if (getContentMode() === "sites" && !(await getEditorIdentity())) {
    throw new Error("The Studio needs a signed-in editor.");
  }
}

export const getStudioEditorialRepositories = async () => {
  await requireSitesEditor();
  return composeStudioEditorialRepositories(createServerSupabaseClient, editorAuthorId);
};

/**
 * The signed-in editor's own repository, including the category, entity and batch writes. With
 * Supabase RLS applies; on Sites the callers have already checked that an editor is signed in.
 */
export const getStudioAdminEditorialRepository = async () => {
  await requireSitesEditor();
  return composeStudioAdminEditorialRepository(createServerSupabaseClient, editorAuthorId);
};

export const getStudioNewsletterCampaignService = async () => {
  await requireSitesEditor();
  return composeStudioNewsletterCampaignService(createServerSupabaseClient);
};

/**
 * The newsroom team. It has full access to its store (D1 has no row-level security, and Supabase needs the
 * service-role key to invite), so it is only handed out while an admin is signed in, whatever the caller checked.
 */
export const getStudioEditorDirectory = async () => {
  if ((await getEditorIdentity())?.role !== "admin") throw new Error("Managing the team needs an admin.");
  return getEditorDirectory();
};

/** The contact inbox for the Studio: only handed out while an editor is signed in, in every content mode. */
export const getStudioContactMessageService = async () => {
  if (!(await getEditorIdentity())) throw new Error("The Studio needs a signed-in editor.");
  return getContactMessageService();
};
