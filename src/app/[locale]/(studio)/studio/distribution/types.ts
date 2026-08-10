import type { Locale } from "@/i18n";
import type {
  SocialOutboxStatus,
  SocialProvider,
} from "@/modules/social-publishing/domain/social-publication";

export interface SocialComposerPublication {
  id: string;
  provider: SocialProvider;
  articleTitle: string;
  defaultText: string;
  recoverableJob: { id: string; expectedRevision: number } | null;
}

export interface SocialPreviewState {
  provider: SocialProvider;
  text: string;
  articleUrl: string | null;
  recipient: "[redacted]" | null;
  scheduledFor: string | null;
}

export interface SocialQueueReadback {
  id: string;
  provider: SocialProvider;
  status: SocialOutboxStatus;
  availableAt: string;
}

export interface SocialComposerState {
  status: "idle" | "error" | "preview" | "queued";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  preview?: SocialPreviewState;
  readback?: SocialQueueReadback;
}

export const idleSocialComposerState: SocialComposerState = { status: "idle" };

export interface SocialDistributionCopy {
  locale: Locale;
  title: string;
  description: string;
  composerTitle: string;
  composerDescription: string;
  channel: string;
  story: string;
  message: string;
  messageHelp: string;
  recipient: string;
  recipientHelp: string;
  schedule: string;
  scheduleHelp: string;
  confirm: string;
  preview: string;
  queue: string;
  requeue: string;
  requeueNotice: string;
  pending: string;
  previewTitle: string;
  validated: string;
  canonicalLink: string;
  recipientRedacted: string;
  queueTitle: string;
  queueDescription: string;
  configured: string;
  unavailable: string;
  emptyPublications: string;
  emptyQueue: string;
  allProviders: string;
  allStatuses: string;
  filter: string;
  scheduledAt: string;
  attempted: string;
  delivery: string;
  openPost: string;
  cancel: string;
  retry: string;
  cancelConfirm: string;
  retryConfirm: string;
  cancelled: string;
  retried: string;
  mutationError: string;
  latestLimit: string;
}
