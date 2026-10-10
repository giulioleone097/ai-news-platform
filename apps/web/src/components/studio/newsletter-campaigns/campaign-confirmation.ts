import { z } from "zod";

const campaignRequestSchema = z.object({
  intent: z.enum(["save", "schedule", "send", "cancel"]),
  confirmation: z.string().nullable(),
}).superRefine((value, context) => {
  if (value.intent !== "save" && value.confirmation !== value.intent) {
    context.addIssue({
      code: "custom",
      path: ["confirmation"],
      message: "Explicit confirmation is required.",
    });
  }
});

export function parseNewsletterCampaignRequest(formData: FormData) {
  return campaignRequestSchema.safeParse({
    intent: formData.get("intent"),
    confirmation: formData.get("confirmation"),
  });
}
