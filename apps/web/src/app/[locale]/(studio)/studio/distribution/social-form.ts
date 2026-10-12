import { z } from "zod";
import { studioFieldErrors } from "@/components/studio/field-errors";
import { locales, type Locale } from "@/i18n";
import { parseUtcDateTimeInput } from "@/lib/editorial-datetime";
import { socialProviders } from "@atlasnews/core/social-publishing/domain/social-publication";

const recipientPattern = /^\+?[1-9][0-9]{6,14}$/;

const composerSchema = z.object({
  intent: z.enum(["preview", "enqueue", "requeue"]),
  locale: z.enum(locales),
  publicationId: z.uuid(),
  provider: z.enum(socialProviders),
  text: z.string().trim().min(1).max(4_096),
  recipient: z.string().trim().max(32),
  scheduledFor: z.string().trim().max(40),
  confirm: z.boolean(),
  jobId: z.string().trim().max(64),
  expectedRevision: z.number().int(),
}).superRefine((value, context) => {
  if (value.scheduledFor && !parseUtcDateTimeInput(value.scheduledFor)) {
    context.addIssue({ code: "custom", path: ["scheduledFor"], message: "Enter a valid UTC date and time." });
  }
  if (value.provider === "whatsapp" && !recipientPattern.test(value.recipient)) {
    context.addIssue({ code: "custom", path: ["recipient"], message: "Enter a phone number in international format or a WhatsApp ID." });
  }
  if (value.provider !== "whatsapp" && value.recipient) {
    context.addIssue({ code: "custom", path: ["recipient"], message: "A recipient is only used for WhatsApp." });
  }
  if (value.intent === "requeue") {
    if (!z.uuid().safeParse(value.jobId).success) {
      context.addIssue({ code: "custom", path: ["jobId"], message: "Invalid recoverable job." });
    }
    if (value.expectedRevision < 0) {
      context.addIssue({ code: "custom", path: ["expectedRevision"], message: "Invalid job revision." });
    }
  }
});

const mutationSchema = z.object({
  id: z.uuid(),
  locale: z.enum(locales),
  confirm: z.literal(true),
});

export type SocialComposerForm = z.infer<typeof composerSchema>;

export function parseSocialComposerForm(formData: FormData) {
  return composerSchema.safeParse({
    intent: formData.get("intent"),
    locale: formData.get("locale"),
    publicationId: formData.get("publicationId"),
    provider: formData.get("provider"),
    text: formData.get("text"),
    recipient: formData.get("recipient") ?? "",
    scheduledFor: formData.get("scheduledFor") ?? "",
    confirm: formData.get("confirm") === "on",
    jobId: formData.get("jobId") ?? "",
    expectedRevision: Number(formData.get("expectedRevision") ?? -1),
  });
}

export function parseSocialQueueMutationForm(formData: FormData) {
  return mutationSchema.safeParse({
    id: formData.get("id"),
    locale: formData.get("locale"),
    confirm: formData.get("confirm") === "true",
  });
}

/** The rules above are written in English; an Italian editor reads them in Italian. */
const italianRules: Record<string, string> = {
  "Enter a valid UTC date and time.": "Inserisci una data e un’ora UTC valide.",
  "Enter a phone number in international format or a WhatsApp ID.": "Inserisci un numero in formato internazionale o un ID WhatsApp.",
  "A recipient is only used for WhatsApp.": "Il destinatario serve solo per WhatsApp.",
};

export function socialFormFieldErrors(error: z.ZodError, locale: Locale) {
  const errors = studioFieldErrors(error, locale);
  if (locale !== "it") return errors;
  return Object.fromEntries(
    Object.entries(errors).map(([field, messages]) => [field, messages.map((message) => italianRules[message] ?? message)]),
  );
}
