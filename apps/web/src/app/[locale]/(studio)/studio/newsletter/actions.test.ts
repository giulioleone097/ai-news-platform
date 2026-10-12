import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  requireEditor: vi.fn(async () => ({ userId: "editor-1" })),
  run: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/editor-auth", () => ({ requireEditor: mocks.requireEditor }));
// The newsletter forms reach the services only through the catalogue's capabilities.
vi.mock("@/server/capabilities", () => ({ runEditorCapability: mocks.run }));

import { idleStudioActionState } from "@/components/studio/action-state";
import { saveNewsletterCampaignAction } from "./campaigns/actions";
import { requestNewsletterReconfirmationAction } from "./subscription-actions";

const campaignId = "6f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e6f";

function campaignForm(fields: Record<string, string> = {}) {
  const form = new FormData();
  const values: Record<string, string> = {
    locale: "en",
    intent: "save",
    subject: "Weekly digest",
    fromName: "AtlasNews",
    fromEmail: "news@example.com",
    content: "Hello readers.",
    audienceLocale: "en",
    ...fields,
  };
  for (const [name, value] of Object.entries(values)) form.set(name, value);
  return form;
}

const names = () => mocks.run.mock.calls.map(([name]) => name);

beforeEach(() => {
  mocks.revalidatePath.mockClear();
  mocks.redirect.mockClear();
  mocks.run.mockReset().mockResolvedValue({ ok: true, result: { campaign: { id: campaignId } } });
});

describe("the campaign form", () => {
  it("saves a draft through the capability with a blank reply-to, and opens the campaign", async () => {
    await expect(saveNewsletterCampaignAction(idleStudioActionState, campaignForm())).rejects.toThrow(
      `REDIRECT:/en/studio/newsletter/campaigns/${campaignId}?updated=save`,
    );

    expect(mocks.run).toHaveBeenCalledOnce();
    expect(mocks.run).toHaveBeenCalledWith(
      "admin_newsletter_save_campaign_draft",
      expect.objectContaining({ locale: "en", subject: "Weekly digest", replyTo: "", audienceStatus: "active" }),
      { locale: "en" },
    );
  });

  it("queues the saved draft for delivery only with the form's confirmation, and runs the capability confirmed", async () => {
    await expect(
      saveNewsletterCampaignAction(idleStudioActionState, campaignForm({ intent: "send" })),
    ).resolves.toMatchObject({ status: "error" });
    expect(mocks.run).not.toHaveBeenCalled();

    await expect(
      saveNewsletterCampaignAction(idleStudioActionState, campaignForm({ intent: "send", confirmation: "send" })),
    ).rejects.toThrow("?updated=send");
    expect(names()).toEqual(["admin_newsletter_save_campaign_draft", "admin_newsletter_send_campaign"]);
    expect(mocks.run).toHaveBeenLastCalledWith("admin_newsletter_send_campaign", { id: campaignId }, { confirmed: true, locale: "en" });
  });

  it("schedules for the UTC instant of the form", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);

    await expect(
      saveNewsletterCampaignAction(
        idleStudioActionState,
        campaignForm({ intent: "schedule", confirmation: "schedule", scheduledFor: future }),
      ),
    ).rejects.toThrow("?updated=schedule");

    expect(mocks.run).toHaveBeenLastCalledWith(
      "admin_newsletter_schedule_campaign",
      { id: campaignId, scheduledFor: `${future}:00.000Z` },
      { confirmed: true, locale: "en" },
    );
  });

  it("cancels a campaign through the capability, confirmed", async () => {
    await expect(
      saveNewsletterCampaignAction(
        idleStudioActionState,
        campaignForm({ intent: "cancel", confirmation: "cancel", id: campaignId, locale: "it" }),
      ),
    ).rejects.toThrow(`REDIRECT:/it/studio/newsletter/campaigns/${campaignId}?updated=cancelled`);

    expect(mocks.run).toHaveBeenCalledWith("admin_newsletter_cancel_campaign", { id: campaignId }, { confirmed: true, locale: "it" });
  });

  it("keeps the form's own sentence for a failure, and shows a refusal about the person as it is", async () => {
    mocks.run.mockResolvedValueOnce({ ok: false, status: 503, error: "The service is not available." });
    await expect(saveNewsletterCampaignAction(idleStudioActionState, campaignForm({ locale: "it" }))).resolves.toEqual({
      status: "error",
      message: "Non è stato possibile completare l’operazione. Controlla lo stato della campagna e riprova.",
    });

    mocks.run.mockResolvedValueOnce({ ok: false, status: 403, error: "Questo account non ha il permesso." });
    await expect(saveNewsletterCampaignAction(idleStudioActionState, campaignForm({ locale: "it" }))).resolves.toEqual({
      status: "error",
      message: "Questo account non ha il permesso.",
    });
  });

  it("sends nothing to the capabilities when the fields are invalid", async () => {
    const state = await saveNewsletterCampaignAction(idleStudioActionState, campaignForm({ subject: "" }));

    expect(state).toMatchObject({ status: "error", message: "Check the highlighted fields." });
    expect(mocks.run).not.toHaveBeenCalled();
  });
});

describe("the reconfirmation form", () => {
  function reconfirmForm() {
    const form = new FormData();
    form.set("email", "Reader@Example.com");
    form.set("locale", "it");
    return form;
  }

  it("asks for a double opt-in email through the capability, naming the Studio as the source", async () => {
    mocks.run.mockResolvedValue({ ok: true, result: { request: {} } });

    await expect(requestNewsletterReconfirmationAction(reconfirmForm())).rejects.toThrow(
      "REDIRECT:/it/studio/newsletter?confirmation=1",
    );

    expect(mocks.run).toHaveBeenCalledWith(
      "admin_newsletter_request_subscription",
      { email: "reader@example.com", locale: "it", source: "studio-reactivation" },
      { confirmed: true, locale: "it" },
    );
  });

  it("reports a refusal on the newsletter screen", async () => {
    mocks.run.mockResolvedValue({ ok: false, status: 503, error: "Unavailable." });

    await expect(requestNewsletterReconfirmationAction(reconfirmForm())).rejects.toThrow(
      "REDIRECT:/it/studio/newsletter?error=confirmation",
    );
  });
});
