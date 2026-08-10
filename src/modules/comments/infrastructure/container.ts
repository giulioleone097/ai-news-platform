import "server-only";

import {
  getCommentEnvironment,
  getCommentNotificationEnvironment,
  getNewsletterDeliveryEnvironment,
  getPublicSiteUrl,
  getSupabaseEnvironment,
} from "@/config/env";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { SupabaseCommentNotificationOutbox } from "./supabase-comment-notification-outbox";
import { CommentService } from "../application/comment-service";
import { CommentNotificationDeliveryService } from "../application/comment-notification-delivery";
import {
  commentPolicy,
  type CommentCapability,
} from "../domain/comment";
import { SupabaseCommentRepository } from "./supabase-comment-repository";
import { ResendCommentNotificationProvider } from "./resend-comment-notification-provider";

export function getCommentCapability(): CommentCapability {
  const readable = Boolean(getSupabaseEnvironment());
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

export function createPublicCommentService() {
  const readClient = createPublicSupabaseClient();
  return readClient
    ? new CommentService(new SupabaseCommentRepository(readClient, null))
    : null;
}

export function createMutationCommentService() {
  if (!getCommentEnvironment()) return null;
  const readClient = createPublicSupabaseClient();
  const serviceClient = createServiceSupabaseClient();
  return readClient && serviceClient
    ? new CommentService(new SupabaseCommentRepository(readClient, serviceClient))
    : null;
}

export function createCommentNotificationOutbox() {
  if (!getCommentEnvironment()) return null;
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
