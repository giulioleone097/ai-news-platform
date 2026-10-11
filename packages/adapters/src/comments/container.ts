import {
  getCommentEnvironment,
  getCommentNotificationEnvironment,
  getContentMode,
  getNewsletterDeliveryEnvironment,
  getPublicSiteUrl,
  getSupabaseEnvironment,
} from "../config/env";
import { createPublicSupabaseClient } from "../supabase/public";
import { createServiceSupabaseClient } from "../supabase/service";
import { requireSitesBindings } from "../sites/bindings";
import { D1CommentNotificationOutbox } from "./d1-comment-notification-outbox";
import { D1CommentRepository } from "./d1-comment-repository";
import { SupabaseCommentNotificationOutbox } from "./supabase-comment-notification-outbox";
import type { CommentRepository } from "@atlasnews/core/comments/application/comment-repository";
import { CommentOperationError } from "@atlasnews/core/comments/application/errors";
import { CommentService } from "@atlasnews/core/comments/application/comment-service";
import { CommentNotificationDeliveryService } from "@atlasnews/core/comments/application/comment-notification-delivery";
import {
  commentPolicy,
  type CommentCapability,
} from "@atlasnews/core/comments/domain/comment";
import { SupabaseCommentRepository } from "./supabase-comment-repository";
import { ResendCommentNotificationProvider } from "./resend-comment-notification-provider";

export function getCommentCapability(): CommentCapability {
  const sites = getContentMode() === "sites";
  const readable = sites || Boolean(getSupabaseEnvironment());
  const mutationEnvironment = getCommentEnvironment();
  const notificationEnvironment = getCommentNotificationEnvironment();
  const mutations = Boolean(mutationEnvironment);
  return {
    readable,
    mutations,
    guestIdentity: mutations,
    moderation: mutations,
    notifications: Boolean(notificationEnvironment),
    reason: !readable
      ? "supabase_unavailable"
      : !mutations
        ? "mutation_configuration_missing"
        : null,
    policy: commentPolicy,
  };
}

function createSitesCommentRepository() {
  return new D1CommentRepository(requireSitesBindings().database);
}

/** Approved comments only, as the Supabase repository without a service client: D1 has no RLS to stop the rest. */
function publicCommentRepository(repository: CommentRepository): CommentRepository {
  const refuse = () => Promise.reject(
    new CommentOperationError("configuration_unavailable", "Comment mutations are unavailable.", 503),
  );
  return {
    listApproved: (query) => repository.listApproved(query),
    listOwn: refuse,
    create: refuse,
    editOwn: refuse,
    deleteOwn: refuse,
    report: refuse,
    listModeration: refuse,
    countByStatus: refuse,
    listReports: refuse,
    moderate: refuse,
    listAudit: refuse,
    verifyNotificationSubscription: refuse,
    unsubscribeNotificationSubscription: refuse,
  };
}

export function createPublicCommentService() {
  if (getContentMode() === "sites") return new CommentService(publicCommentRepository(createSitesCommentRepository()));
  const readClient = createPublicSupabaseClient();
  return readClient
    ? new CommentService(new SupabaseCommentRepository(readClient, null))
    : null;
}

export function createMutationCommentService() {
  if (!getCommentEnvironment()) return null;
  if (getContentMode() === "sites") return new CommentService(createSitesCommentRepository());
  const readClient = createPublicSupabaseClient();
  const serviceClient = createServiceSupabaseClient();
  return readClient && serviceClient
    ? new CommentService(new SupabaseCommentRepository(readClient, serviceClient))
    : null;
}

export function createCommentNotificationOutbox() {
  if (!getCommentEnvironment()) return null;
  if (getContentMode() === "sites") {
    return new D1CommentNotificationOutbox(requireSitesBindings().database);
  }
  const serviceClient = createServiceSupabaseClient();
  return serviceClient ? new SupabaseCommentNotificationOutbox(serviceClient) : null;
}

export function createCommentNotificationDeliveryService() {
  const environment = getCommentNotificationEnvironment();
  const delivery = getNewsletterDeliveryEnvironment();
  const outbox = createCommentNotificationOutbox();
  if (!environment || !delivery || !outbox) return null;
  return new CommentNotificationDeliveryService(
    outbox,
    new ResendCommentNotificationProvider({
      apiKey: delivery.apiKey,
      baseUrl: getPublicSiteUrl(),
      guestSecret: environment.guestSecret,
      fromEmail: delivery.from,
      replyTo: delivery.replyTo,
    }),
  );
}
