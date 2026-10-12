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
vi.mock("@/server/capabilities", () => ({ runEditorCapability: mocks.run }));
vi.mock("@atlasnews/adapters/config/env", () => ({ getPublicSiteUrl: () => new URL("https://atlasnews.example") }));

import { cancelSocialOutboxAction, retrySocialOutboxAction, submitSocialPublicationAction } from "./social-actions";
import { idleSocialComposerState } from "./types";

const publicationId = "6f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e6f";
const jobId = "0b8f6c1e-6a2b-4f7e-9d3e-1a2b3c4d5e6f";
const publications = [{ id: publicationId, channel: "linkedin", articleSlug: "a story", articleLocale: "it" }];
const job = (status: string) => ({ id: jobId, publicationId, provider: "linkedin", status, availableAt: "2026-10-12T10:00:00.000Z" });

/** Answers each capability the actions may call; `overrides` replace one answer. */
function answer(overrides: Record<string, unknown> = {}) {
  const answers: Record<string, unknown> = {
    admin_list_distribution: { ok: true, result: { items: publications } },
    admin_social_preview: {
      ok: true,
      result: { preview: { provider: "linkedin", text: "Hello", articleUrl: "https://atlasnews.example/it/articles/a%20story", recipient: null, scheduledFor: null } },
    },
    admin_social_enqueue: { ok: true, result: { job: job("pending") } },
    admin_social_requeue: { ok: true, result: { job: job("pending") } },
    admin_social_get: { ok: true, result: { job: job("pending") } },
    admin_social_cancel: { ok: true, result: { job: job("cancelled") } },
    admin_social_retry: { ok: true, result: { job: job("pending") } },
    ...overrides,
  };
  mocks.run.mockImplementation(async (name: string) => answers[name]);
}

function composerForm(fields: Record<string, string> = {}) {
  const form = new FormData();
  const values: Record<string, string> = {
    locale: "it",
    intent: "preview",
    publicationId,
    provider: "linkedin",
    text: "Hello",
    ...fields,
  };
  for (const [name, value] of Object.entries(values)) form.set(name, value);
  return form;
}

function queueForm(locale = "it") {
  const form = new FormData();
  form.set("id", jobId);
  form.set("locale", locale);
  form.set("confirm", "true");
  return form;
}

const names = () => mocks.run.mock.calls.map(([name]) => name);

beforeEach(() => {
  mocks.revalidatePath.mockClear();
  mocks.redirect.mockClear();
  mocks.run.mockReset();
  answer();
});

describe("the social composer", () => {
  it("previews through the capability with the canonical article address, not one the form typed", async () => {
    const state = await submitSocialPublicationAction(idleSocialComposerState, composerForm());

    expect(state).toMatchObject({ status: "preview", preview: { provider: "linkedin", text: "Hello" } });
    expect(names()).toEqual(["admin_list_distribution", "admin_social_preview"]);
    expect(mocks.run).toHaveBeenLastCalledWith(
      "admin_social_preview",
      {
        publicationId,
        provider: "linkedin",
        payload: { text: "Hello", articleUrl: "https://atlasnews.example/it/articles/a%20story", recipient: undefined },
        scheduledFor: undefined,
      },
      { locale: "it" },
    );
  });

  it("refuses a publication that is not the locale's or not for this channel, before anything is previewed", async () => {
    const state = await submitSocialPublicationAction(idleSocialComposerState, composerForm({ provider: "x" }));

    expect(state).toEqual({ status: "error", message: "Il post scelto non appartiene a questa lingua o a questo canale." });
    expect(names()).toEqual(["admin_list_distribution"]);
  });

  it("queues only with the confirm box, then reads the job back from the store", async () => {
    const unconfirmed = await submitSocialPublicationAction(idleSocialComposerState, composerForm({ intent: "enqueue" }));
    expect(unconfirmed).toMatchObject({ status: "error", fieldErrors: { confirm: expect.any(Array) } });
    expect(names()).not.toContain("admin_social_enqueue");

    const queued = await submitSocialPublicationAction(idleSocialComposerState, composerForm({ intent: "enqueue", confirm: "on" }));
    expect(queued).toEqual({
      status: "queued",
      readback: { id: jobId, provider: "linkedin", status: "pending", availableAt: "2026-10-12T10:00:00.000Z" },
    });
    expect(mocks.run).toHaveBeenCalledWith("admin_social_enqueue", expect.objectContaining({ publicationId }), { confirmed: true, locale: "it" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/it/studio/distribution");
  });

  it("requeues a recoverable job with its revision", async () => {
    await submitSocialPublicationAction(
      idleSocialComposerState,
      composerForm({ intent: "requeue", confirm: "on", jobId, expectedRevision: "3" }),
    );

    expect(mocks.run).toHaveBeenCalledWith(
      "admin_social_requeue",
      expect.objectContaining({ id: jobId, expectedRevision: 3, publicationId }),
      { confirmed: true, locale: "it" },
    );
  });

  it("does not report a post as queued when the store does not hold it", async () => {
    answer({ admin_social_get: { ok: true, result: { job: null } } });

    const state = await submitSocialPublicationAction(idleSocialComposerState, composerForm({ intent: "enqueue", confirm: "on" }));

    expect(state).toEqual({ status: "error", message: "L’archivio dei post non è disponibile. Non è stato inviato nulla." });
  });

  it("tells a post the channel refuses apart from a channel that is not set up", async () => {
    answer({ admin_social_preview: { ok: false, status: 400, error: "x", code: "social.invalidInput" } });
    expect(await submitSocialPublicationAction(idleSocialComposerState, composerForm())).toMatchObject({
      message: "Controlla i campi evidenziati e controlla di nuovo l’anteprima.",
    });

    answer({ admin_social_preview: { ok: false, status: 503, error: "x", code: "social.notConfigured" } });
    expect(await submitSocialPublicationAction(idleSocialComposerState, composerForm())).toMatchObject({
      message: "Questo canale non è configurato per la pubblicazione.",
    });
  });
});

describe("the queue buttons", () => {
  it("cancel a job of the locale's publications through the capability, confirmed", async () => {
    answer({ admin_social_get: { ok: true, result: { job: job("pending") } } });

    await expect(cancelSocialOutboxAction(queueForm())).rejects.toThrow("REDIRECT:/it/studio/distribution?queueUpdated=cancel");

    expect(mocks.run).toHaveBeenCalledWith("admin_social_cancel", { id: jobId }, { confirmed: true, locale: "it" });
  });

  it("retry a failed job", async () => {
    await expect(retrySocialOutboxAction(queueForm("en"))).rejects.toThrow("REDIRECT:/en/studio/distribution?queueUpdated=retry");

    expect(mocks.run).toHaveBeenCalledWith("admin_social_retry", { id: jobId }, { confirmed: true, locale: "en" });
  });

  it("leave a job of another locale's publication alone", async () => {
    answer({ admin_list_distribution: { ok: true, result: { items: [] } } });

    await expect(cancelSocialOutboxAction(queueForm())).rejects.toThrow("REDIRECT:/it/studio/distribution?queueError=ownership");
    expect(names()).not.toContain("admin_social_cancel");
  });

  it("report a job that is not in the state the action should leave it in", async () => {
    answer({ admin_social_cancel: { ok: true, result: { job: job("pending") } } });

    await expect(cancelSocialOutboxAction(queueForm())).rejects.toThrow("REDIRECT:/it/studio/distribution?queueError=cancel");
  });
});
