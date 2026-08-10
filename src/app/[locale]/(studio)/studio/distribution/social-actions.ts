"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPublicSiteUrl } from "@/config/env";
import type { Locale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { parseUtcDateTimeInput } from "@/lib/editorial-datetime";
import { getStudioEditorialRepositories } from "@/modules/editorial/infrastructure/container";
import { previewSocialPublication } from "@/modules/social-publishing/application/preview";
import { SocialPublishingError } from "@/modules/social-publishing/domain/errors";
import {
  publicSocialOutboxJob,
  type EnqueueSocialPublicationInput,
  type SocialProvider,
} from "@/modules/social-publishing/domain/social-publication";
import { createSocialPublishingRuntime } from "@/modules/social-publishing/infrastructure/runtime";
import {
  parseSocialComposerForm,
  parseSocialQueueMutationForm,
  socialFormFieldErrors,
  type SocialComposerForm,
} from "./social-form";
import type { SocialComposerState } from "./types";

function actionMessage(locale: Locale, kind: "validation" | "configuration" | "persistence" | "ownership" | "confirm") {
  const messages = locale === "it" ? {
    validation: "Controlla i campi evidenziati e valida di nuovo.",
    configuration: "Questo canale non è configurato per la pubblicazione.",
    persistence: "L’outbox non è disponibile. Nessun invio è stato eseguito.",
    ownership: "La pubblicazione selezionata non appartiene a questa lingua o canale.",
    confirm: "Conferma esplicitamente l’invio prima di accodarlo.",
  } : {
    validation: "Check the highlighted fields and validate again.",
    configuration: "This channel is not configured for publishing.",
    persistence: "The outbox is unavailable. No dispatch was performed.",
    ownership: "The selected publication does not belong to this language and channel.",
    confirm: "Explicitly confirm the dispatch before queueing it.",
  };
  return messages[kind];
}

async function getAuthorizedPublication(locale: Locale, publicationId: string, provider: SocialProvider) {
  const repositories = await getStudioEditorialRepositories();
  const publications = await repositories.distribution.listPublications(locale);
  return publications.find((publication) => (
    publication.id === publicationId && publication.channel === provider
  )) ?? null;
}

function canonicalArticleUrl(locale: Locale, slug: string) {
  const base = getPublicSiteUrl();
  if (base.protocol !== "https:" || base.username || base.password) return undefined;
  return new URL(`/${locale}/articles/${encodeURIComponent(slug)}`, base).toString();
}

function enqueueInput(input: SocialComposerForm, articleSlug: string): EnqueueSocialPublicationInput {
  return {
    publicationId: input.publicationId,
    provider: input.provider,
    payload: {
      text: input.text,
      articleUrl: canonicalArticleUrl(input.locale, articleSlug),
      recipient: input.provider === "whatsapp" ? input.recipient : undefined,
    },
    scheduledFor: input.scheduledFor ? parseUtcDateTimeInput(input.scheduledFor) : null,
  };
}

function failureState(locale: Locale, error: unknown): SocialComposerState {
  if (error instanceof SocialPublishingError) {
    const kind = error.code === "configuration_error"
      ? "configuration"
      : error.code === "invalid_input"
        ? "validation"
        : "persistence";
    return { status: "error", message: actionMessage(locale, kind) };
  }
  return { status: "error", message: actionMessage(locale, "persistence") };
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
      fieldErrors: socialFormFieldErrors(parsed.error),
    };
  }

  const input = parsed.data;
  await requireEditor(input.locale);
  const publication = await getAuthorizedPublication(
    input.locale,
    input.publicationId,
    input.provider,
  );
  if (!publication) {
    return { status: "error", message: actionMessage(input.locale, "ownership") };
  }

  try {
    const runtime = createSocialPublishingRuntime();
    const command = enqueueInput(input, publication.articleSlug);
    const preview = previewSocialPublication(command, runtime.providers);

    if (input.intent === "preview") {
      return {
        status: "preview",
        message: preview.valid ? undefined : actionMessage(input.locale, "validation"),
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

    const queued = input.intent === "requeue"
      ? await runtime.service.requeue({
          ...command,
          id: input.jobId,
          expectedRevision: input.expectedRevision,
        }, true)
      : await runtime.service.enqueue(command);
    const persisted = await runtime.service.getById(queued.id);
    if (!persisted || persisted.status !== queued.status) {
      return { status: "error", message: actionMessage(input.locale, "persistence") };
    }
    const readback = publicSocialOutboxJob(persisted);
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
  } catch (error) {
    return failureState(input.locale, error);
  }
}

async function mutateOwnedJob(formData: FormData, operation: "cancel" | "retry") {
  const parsed = parseSocialQueueMutationForm(formData);
  const fallbackLocale = formData.get("locale") === "it" ? "it" : "en";
  if (!parsed.success) redirect(`/${fallbackLocale}/studio/distribution?queueError=validation`);

  const input = parsed.data;
  await requireEditor(input.locale);

  try {
    const runtime = createSocialPublishingRuntime();
    const [job, repositories] = await Promise.all([
      runtime.service.getById(input.id),
      getStudioEditorialRepositories(),
    ]);
    const publications = await repositories.distribution.listPublications(input.locale);
    if (!job || !publications.some((publication) => publication.id === job.publicationId)) {
      redirect(`/${input.locale}/studio/distribution?queueError=ownership`);
    }

    const updated = operation === "cancel"
      ? await runtime.service.cancelPending(job.id, input.confirm)
      : await runtime.service.retryFailed(job.id, input.confirm);
    const expected = operation === "cancel" ? "cancelled" : "pending";
    if (updated.status !== expected) throw new Error("Outbox read-back mismatch.");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/${input.locale}/studio/distribution?queueError=${operation}`);
  }

  revalidatePath(`/${input.locale}/studio/distribution`);
  redirect(`/${input.locale}/studio/distribution?queueUpdated=${operation}`);
}

export async function cancelSocialOutboxAction(formData: FormData) {
  return mutateOwnedJob(formData, "cancel");
}

export async function retrySocialOutboxAction(formData: FormData) {
  return mutateOwnedJob(formData, "retry");
}
