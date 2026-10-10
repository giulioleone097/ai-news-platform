import { createCommentAdminToolHandlers } from "@atlasnews/core/comments/application/admin-tools";

import { implement, type Principal } from "../capability";
import type { CapabilityPorts } from "../ports";
import {
  adminCommentProcessNotifications,
  adminListCommentAudit,
  adminListCommentReports,
  adminListComments,
  adminModerateComment,
  adminNewsletterCancelCampaign,
  adminNewsletterEraseSubscription,
  adminNewsletterGetCampaign,
  adminNewsletterListCampaigns,
  adminNewsletterListRecipients,
  adminNewsletterProcessOutbox,
  adminNewsletterRequestSubscription,
  adminNewsletterSaveCampaignDraft,
  adminNewsletterScheduleCampaign,
  adminNewsletterSendCampaign,
  adminSocialCancel,
  adminSocialEnqueue,
  adminSocialGet,
  adminSocialList,
  adminSocialPreview,
  adminSocialProcessOutbox,
  adminSocialRequeue,
  adminSocialRetry,
} from "../specs/operations";
import { createSocialPublishingMcpHandlers } from "./social-outbox";

async function commentHandlers(ports: CapabilityPorts, principal: Principal) {
  return createCommentAdminToolHandlers(await ports.moderation(), {
    kind: "system",
    userId: null,
    label: principal.kind === "editor" ? principal.subject : "anonymous",
  });
}

async function socialHandlers(ports: CapabilityPorts) {
  return createSocialPublishingMcpHandlers(await ports.social());
}

// The adapter has already collected the confirmation of these tools; the social handlers
// keep their own guard, so they are told it was given.
const confirmed = { confirm: true } as const;

export const operationsCapabilities = [
  implement(adminListComments, async (ports, input, principal) => ({
    page: await (await commentHandlers(ports, principal)).admin_list_comments(input),
  })),
  implement(adminListCommentReports, async (ports, input, principal) => ({
    reports: await (await commentHandlers(ports, principal)).admin_list_comment_reports(input),
  })),
  implement(adminModerateComment, async (ports, input, principal) => ({
    result: await (await commentHandlers(ports, principal)).admin_moderate_comment(input),
  })),
  implement(adminListCommentAudit, async (ports, input, principal) => ({
    page: await (await commentHandlers(ports, principal)).admin_list_comment_audit(input),
  })),
  implement(adminCommentProcessNotifications, async (ports, { limit }) => ({
    batch: await (await ports.commentNotifications()).processBatch({ limit }),
  })),

  implement(adminNewsletterListCampaigns, async (ports, input) => ({
    page: await (await ports.newsletter()).campaign.listCampaigns(input),
  })),
  implement(adminNewsletterGetCampaign, async (ports, { id }) => ({
    campaign: await (await ports.newsletter()).campaign.getCampaign(id),
  })),
  implement(adminNewsletterListRecipients, async (ports, { id, limit }) => ({
    recipients: await (await ports.newsletter()).campaign.listRecipients(id, limit),
  })),
  implement(adminNewsletterSaveCampaignDraft, async (ports, input) => {
    const { campaign, authorId } = await ports.newsletter();
    return { campaign: await campaign.saveDraft(input, authorId) };
  }),
  implement(adminNewsletterSendCampaign, async (ports, { id }) => ({
    campaign: await (await ports.newsletter()).campaign.sendNow(id),
  })),
  implement(adminNewsletterScheduleCampaign, async (ports, { id, scheduledFor }) => ({
    campaign: await (await ports.newsletter()).campaign.schedule(id, scheduledFor),
  })),
  implement(adminNewsletterCancelCampaign, async (ports, { id }) => ({
    campaign: await (await ports.newsletter()).campaign.cancel(id),
  })),
  implement(adminNewsletterRequestSubscription, async (ports, { email, locale, source }) => {
    const { delivery, authorId } = await ports.newsletter();
    return {
      request: await delivery.requestSubscription({ email, locale, source }, { requester: `mcp:${authorId}` }),
    };
  }),
  implement(adminNewsletterEraseSubscription, async (ports, { subscriptionId }) => ({
    erased: await (await ports.newsletter()).campaign.eraseSubscription(subscriptionId),
  })),
  implement(adminNewsletterProcessOutbox, async (ports, { limit, leaseSeconds }) => ({
    batch: await (await ports.newsletter()).delivery.processOutboxBatch({ limit, leaseSeconds }),
  })),

  implement(adminSocialPreview, async (ports, input) => ({
    preview: await (await socialHandlers(ports)).social_outbox_preview(input),
  })),
  implement(adminSocialEnqueue, async (ports, input) => ({
    job: await (await socialHandlers(ports)).social_outbox_enqueue({ ...input, ...confirmed }),
  })),
  implement(adminSocialRequeue, async (ports, input) => ({
    job: await (await socialHandlers(ports)).social_outbox_requeue({ ...input, ...confirmed }),
  })),
  implement(adminSocialList, async (ports, input) => ({
    page: await (await socialHandlers(ports)).social_outbox_list(input),
  })),
  implement(adminSocialGet, async (ports, input) => ({
    job: await (await socialHandlers(ports)).social_outbox_get(input),
  })),
  implement(adminSocialCancel, async (ports, input) => ({
    job: await (await socialHandlers(ports)).social_outbox_cancel({ ...input, ...confirmed }),
  })),
  implement(adminSocialRetry, async (ports, input) => ({
    job: await (await socialHandlers(ports)).social_outbox_retry({ ...input, ...confirmed }),
  })),
  implement(adminSocialProcessOutbox, async (ports) => ({
    batch: { ...await (await socialHandlers(ports)).social_outbox_process(confirmed) },
  })),
];
