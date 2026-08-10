import { z } from "zod";
import { locales } from "@/i18n";
import { parseUtcDateTimeInput } from "@/lib/editorial-datetime";
import { socialProviders } from "@/modules/social-publishing/domain/social-publication";

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
    context.addIssue({ code: "custom", path: ["scheduledFor"], message: "Invalid UTC date." });
  }
  if (value.provider === "whatsapp" && !recipientPattern.test(value.recipient)) {
    context.addIssue({ code: "custom", path: ["recipient"], message: "Enter an explicit E.164 or wa_id recipient." });
  }
  if (value.provider !== "whatsapp" && value.recipient) {
    context.addIssue({ code: "custom", path: ["recipient"], message: "Recipients are only valid for WhatsApp." });
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

export function socialFormFieldErrors(error: z.ZodError) {
  const result: Record<string, string[]> = {};
  const flattened = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  for (const [field, errors] of Object.entries(flattened)) {
    if (errors?.length) result[field] = errors.map(String);
  }
  return result;
}
