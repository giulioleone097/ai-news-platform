import { implement } from "../capability";
import {
  adminNewsletterCancelCampaign,
  adminNewsletterDeleteCampaignDraft,
  adminNewsletterEraseSubscription,
  adminNewsletterGetCampaign,
  adminNewsletterListCampaigns,
  adminNewsletterListRecipients,
  adminNewsletterProcessOutbox,
  adminNewsletterRequestSubscription,
  adminNewsletterSaveCampaignDraft,
  adminNewsletterScheduleCampaign,
  adminNewsletterSendCampaign,
  adminNewsletterUpdateCampaignDraft,
} from "../specs/newsletter";
import { markUntrusted } from "../untrusted";

/** Newsletter campaigns and their delivery. The subscriber registry is in `newsroom.ts`. */
export const newsletterCapabilities = [
  implement(adminNewsletterListCampaigns, async (ports, input) => ({
    page: await (await ports.newsletter()).campaign.listCampaigns(input),
  })),
  implement(adminNewsletterGetCampaign, async (ports, { id }) => ({
    campaign: await (await ports.newsletter()).campaign.getCampaign(id),
  })),
  implement(adminNewsletterListRecipients, async (ports, { id, limit }) => markUntrusted({
    recipients: await (await ports.newsletter()).campaign.listRecipients(id, limit),
  }, ["recipients[].email"])),
  implement(adminNewsletterSaveCampaignDraft, async (ports, input) => {
    const { campaign, authorId } = await ports.newsletter();
    return { campaign: await campaign.saveDraft(input, authorId) };
  }),
  implement(adminNewsletterUpdateCampaignDraft, async (ports, { id, ...changes }) => {
    const { campaign, authorId } = await ports.newsletter();
    return { campaign: await campaign.patchDraft(id, changes, authorId) };
  }),
  implement(adminNewsletterDeleteCampaignDraft, async (ports, { id }) => ({
    deletedId: await (await ports.newsletter()).campaign.deleteDraft(id),
  })),
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
];
