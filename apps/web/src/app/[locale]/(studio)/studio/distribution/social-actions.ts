"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Locale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { parseUtcDateTimeInput } from "@/lib/editorial-datetime";
import type { CapabilityRunResult } from "@/server/capabilities";
import { runStudioCapability } from "@/server/studio-capability";
import { findPublication, type DistributionPublication } from "@atlasnews/core/editorial/domain/editorial-operations";
import type { SocialOutboxStatus, SocialProvider } from "@atlasnews/core/social-publishing/domain/social-publication";
import {
  parseSocialComposerForm,
  parseSocialQueueMutationForm,
  socialFormFieldErrors,
  type SocialComposerForm,
} from "./social-form";
import type { SocialComposerState } from "./types";

type Failed = Extract<CapabilityRunResult, { ok: false }>;

/** What the outbox capabilities return for a job (the part the Studio reads). */
interface OutboxJob {
  id: string;
  publicationId: string;
  provider: SocialProvider;
  status: SocialOutboxStatus;
  availableAt: string;
}

function actionMessage(locale: Locale, kind: "validation" | "configuration" | "persistence" | "ownership" | "confirm") {
  const messages = locale === "it" ? {
    validation: "Controlla i campi evidenziati e controlla di nuovo l’anteprima.",
    configuration: "Questo canale non è configurato per la pubblicazione.",
    persistence: "L’archivio dei post non è disponibile. Non è stato inviato nulla.",
    ownership: "Il post scelto non appartiene a questa lingua o a questo canale.",
    confirm: "Conferma il post prima di pubblicarlo.",
  } : {
    validation: "Check the highlighted fields and check the preview again.",
    configuration: "This channel is not configured for publishing.",
    persistence: "The store for posts is unavailable. Nothing was sent.",
    ownership: "The chosen post does not belong to this language and channel.",
    confirm: "Confirm the post before publishing it.",
  };
  return messages[kind];
}

/** The publications the editor's locale lists: the only ones a post may be about. */
async function listPublications(locale: Locale) {
  const listed = await runStudioCapability(locale, "admin_list_distribution", { locale });
  return listed.ok ? { items: listed.result.items as DistributionPublication[] } : { failed: listed };
}

/**
 * The post as the outbox capabilities take it: what the person chose. The capabilities check the publication and
 * link the article's canonical address themselves, for every caller.
 */
function postInput(input: SocialComposerForm) {
  const scheduledFor = input.scheduledFor ? parseUtcDateTimeInput(input.scheduledFor) : null;
  return {
    publicationId: input.publicationId,
    provider: input.provider,
    payload: {
      text: input.text,
      recipient: input.provider === "whatsapp" ? input.recipient : undefined,
    },
    scheduledFor: scheduledFor ?? undefined,
  };
}

/** The sentence for a refused capability call: the code says whether the post, the channel or the store is at fault. */
function failureState(locale: Locale, outcome: Failed): SocialComposerState {
  const kind = outcome.code === "social.notConfigured"
    ? "configuration"
    : outcome.code === "social.invalidInput"
      ? "validation"
      : "persistence";
  return { status: "error", message: actionMessage(locale, kind) };
}

export async function submitSocialPublicationAction(
  _previousState: SocialComposerState,
  formData: FormData,
): Promise<SocialComposerState> {
  const parsed = parseSocialComposerForm(formData);
  const localeValue = formData.get("locale");
  const locale: Locale = localeValue === "it" ? "it" : "en";
  if (!parsed.success) {
    return {
      status: "error",
      message: actionMessage(locale, "validation"),
      fieldErrors: socialFormFieldErrors(parsed.error, locale),
    };
  }

  const input = parsed.data;
  await requireEditor(input.locale);
  const run = (name: string, body: unknown, confirmed = false) =>
    runStudioCapability(input.locale, name, body, confirmed ? { confirmed } : {});

  const publications = await listPublications(input.locale);
  if (publications.failed) return failureState(input.locale, publications.failed);
  // The composer works on one language: a publication of the other one is not offered here.
  if (!findPublication(publications.items, input.publicationId, input.provider)) {
    return { status: "error", message: actionMessage(input.locale, "ownership") };
  }

  const post = postInput(input);
  // The preview checks the post against its channel's rules; nothing is queued that it would refuse.
  const previewed = await run("admin_social_preview", post);
  if (!previewed.ok) return failureState(input.locale, previewed);
  const preview = previewed.result.preview as {
    provider: SocialProvider;
    text: string;
    articleUrl: string | null;
    recipient: "[redacted]" | null;
    scheduledFor: string | null;
  };

  if (input.intent === "preview") {
    return {
      status: "preview",
      preview: {
        provider: preview.provider,
        text: preview.text,
        articleUrl: preview.articleUrl,
        recipient: preview.recipient ? "[redacted]" : null,
        scheduledFor: preview.scheduledFor,
      },
    };
  }

  if (!input.confirm) {
    return {
      status: "error",
      message: actionMessage(input.locale, "confirm"),
      fieldErrors: { confirm: [actionMessage(input.locale, "confirm")] },
    };
  }

  // The confirm box on the form is the person's approval to queue this post.
  const queued = input.intent === "requeue"
    ? await run("admin_social_requeue", { ...post, id: input.jobId, expectedRevision: input.expectedRevision }, true)
    : await run("admin_social_enqueue", post, true);
  if (!queued.ok) return failureState(input.locale, queued);
  const job = queued.result.job as OutboxJob;

  // Read the job back from the store: a post is only reported as queued when it is there.
  const stored = await run("admin_social_get", { id: job.id });
  const readback = stored.ok ? stored.result.job as OutboxJob | null : null;
  if (!readback || readback.status !== job.status) {
    return { status: "error", message: actionMessage(input.locale, "persistence") };
  }
  revalidatePath(`/${input.locale}/studio/distribution`);
  return {
    status: "queued",
    readback: {
      id: readback.id,
      provider: readback.provider,
      status: readback.status,
      availableAt: readback.availableAt,
    },
  };
}

async function mutateOwnedJob(formData: FormData, operation: "cancel" | "retry") {
  const parsed = parseSocialQueueMutationForm(formData);
  const fallbackLocale = formData.get("locale") === "it" ? "it" : "en";
  if (!parsed.success) redirect(`/${fallbackLocale}/studio/distribution?queueError=validation`);

  const input = parsed.data;
  await requireEditor(input.locale);
  const board = `/${input.locale}/studio/distribution`;

  const [found, publications] = await Promise.all([
    runStudioCapability(input.locale, "admin_social_get", { id: input.id }),
    listPublications(input.locale),
  ]);
  if (!found.ok || publications.failed) redirect(`${board}?queueError=${operation}`);
  // Only a job of one of this locale's publications can be cancelled or retried from here.
  const job = found.result.job as OutboxJob | null;
  if (!job || !findPublication(publications.items, job.publicationId)) redirect(`${board}?queueError=ownership`);

  // The queue buttons ask the person in a dialog before the form is sent.
  const updated = await runStudioCapability(input.locale, `admin_social_${operation}`, { id: job.id }, { confirmed: true });
  const expected = operation === "cancel" ? "cancelled" : "pending";
  if (!updated.ok || (updated.result.job as OutboxJob).status !== expected) redirect(`${board}?queueError=${operation}`);

  revalidatePath(board);
  redirect(`${board}?queueUpdated=${operation}`);
}

export async function cancelSocialOutboxAction(formData: FormData) {
  return mutateOwnedJob(formData, "cancel");
}

export async function retrySocialOutboxAction(formData: FormData) {
  return mutateOwnedJob(formData, "retry");
}
