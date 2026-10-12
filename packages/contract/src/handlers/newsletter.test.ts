import { describe, expect, it, vi } from "vitest";

import { NewsletterCampaignService } from "@atlasnews/core/newsletter/application/service";
import type { NewsletterCampaign } from "@atlasnews/core/newsletter/domain/newsletter";
import type { NewsletterDeliveryRepository } from "@atlasnews/core/newsletter/domain/ports";

import { capabilities } from "../catalogue";
import { CapabilityFailure, type Principal } from "../capability";
import type { CapabilityPorts } from "../ports";

const id = "33333333-3333-4333-8333-333333333333";
const author = "44444444-4444-4444-8444-444444444444";
const editor: Principal = { kind: "editor", subject: "tester", scopes: ["newsroom.read", "newsroom.write", "newsroom.publish"] };
const find = (name: string) => capabilities.find((capability) => capability.name === name)!;

const draft: NewsletterCampaign = {
  id, locale: "en", status: "draft", subject: "AI briefing", preheader: "", fromName: "AtlasNews", fromEmail: "briefing@example.com",
  replyTo: null, contentMarkdown: "## This week\n\nA campaign body.", contentHtml: "<h2>This week</h2>", audienceLocale: "en",
  audienceStatus: "active", scheduledFor: null, startedAt: null, sentAt: null, cancelledAt: null, recipientCount: 0, sentCount: 0,
  deliveredCount: 0, bounceCount: 0, complaintCount: 0, openCount: 0, clickCount: 0, failureCount: 0,
  createdAt: "2026-10-11T10:00:00.000Z", updatedAt: "2026-10-11T10:00:00.000Z",
};

function ports(stored: NewsletterCampaign | null = draft) {
  const repository = {
    getCampaign: vi.fn(async () => stored),
    saveDraft: vi.fn(async (input) => ({ ...draft, ...input })),
    deleteDraft: vi.fn(async () => true),
    // The D1 and Supabase adapters read whole campaigns, body included, for a list too.
    listCampaigns: vi.fn(async () => ({ items: [draft], total: 1 })),
  } as unknown as NewsletterDeliveryRepository;
  const campaign = new NewsletterCampaignService(repository, {
    fromEmail: "briefing@example.com", replyTo: null, suppressionSecret: "newsletter-test-secret-with-32-characters",
  });
  return { repository, ports: { newsletter: async () => ({ campaign, authorId: author }) } as unknown as CapabilityPorts };
}

describe("newsletter draft capabilities", () => {
  it("answers a campaign, its list and its get with the fields the specs declare", async () => {
    const { ports: over } = ports();
    for (const [name, args] of [
      ["admin_newsletter_get_campaign", { id }],
      ["admin_newsletter_list_campaigns", { locale: "en" }],
    ] as const) {
      const capability = find(name);
      const result = await capability.run(over, capability.input.parse(args), editor);
      // Parsing strips what the spec does not declare, so an equal result proves the output is declared in full.
      expect(capability.output.parse(result), name).toEqual(result);
    }
  });

  it("changes only the fields that are passed, and says so in the description", async () => {
    const { repository, ports: over } = ports();
    const update = find("admin_newsletter_update_campaign_draft");
    const result = await update.run(over, update.input.parse({ id, subject: "A new subject" }), editor);
    expect(update.output.parse(result)).toMatchObject({ campaign: { id, subject: "A new subject", preheader: "" } });
    expect(repository.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ id, subject: "A new subject", fromName: "AtlasNews" }), author);
    expect(update.description).toContain("a field you leave out keeps its stored value");
    // Leaving a field out must not fill it with the default that a whole-draft save uses.
    expect(update.input.parse({ id, subject: "x" })).toEqual({ id, subject: "x" });
    expect(find("admin_newsletter_save_campaign_draft").input.parse({
      locale: "en", subject: "x", fromName: "A", fromEmail: "briefing@example.com", contentMarkdown: "m", audienceLocale: "en",
    })).toMatchObject({ preheader: "", replyTo: "", audienceStatus: "active" });
  });

  it("refuses a patch that changes nothing and a campaign that is no longer a draft, with the reason", async () => {
    const update = find("admin_newsletter_update_campaign_draft");
    await expect(update.run(ports().ports, update.input.parse({ id }), editor)).rejects.toThrow("Nothing to change");
    await expect(update.run(ports({ ...draft, status: "sending" }).ports, update.input.parse({ id, subject: "x" }), editor))
      .rejects.toEqual(new CapabilityFailure("Only a draft can be edited; this campaign is sending."));
  });

  it("deletes a draft behind a confirmation and leaves a queued campaign alone", async () => {
    const remove = find("admin_newsletter_delete_campaign_draft");
    expect(remove.annotations.destructiveHint).toBe(true);
    expect(await remove.confirmation!.question(remove.input.parse({ id }), ports().ports)).toContain(id);

    const { repository, ports: over } = ports();
    expect(remove.output.parse(await remove.run(over, remove.input.parse({ id }), editor))).toEqual({ deletedId: id });
    expect(repository.deleteDraft).toHaveBeenCalledWith(id);

    const queued = ports({ ...draft, status: "scheduled" });
    await expect(remove.run(queued.ports, remove.input.parse({ id }), editor)).rejects.toBeInstanceOf(CapabilityFailure);
    expect(queued.repository.deleteDraft).not.toHaveBeenCalled();
  });
});
