"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod/v4";
import { isLocale, locales } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { moderationTargetStatuses } from "@/modules/comments/domain/comment";
import { createMutationCommentService } from "@/modules/comments/infrastructure/container";
import { requireCommentModerator } from "@/modules/comments/infrastructure/moderator-auth";

const moderationSchema = z.object({
  id: z.string().uuid(),
  locale: z.enum(locales),
  status: z.enum(moderationTargetStatuses),
  reason: z.string().trim().min(2).max(500),
});

export async function moderateCommentAction(formData: FormData) {
  const input = moderationSchema.parse({
    id: formData.get("id"),
    locale: formData.get("locale"),
    status: formData.get("status"),
    reason: formData.get("reason"),
  });
  if (!isLocale(input.locale)) throw new Error("Invalid locale.");

  await requireEditor(input.locale);
  const actor = await requireCommentModerator();
  const service = createMutationCommentService();
  if (!service) throw new Error("Comment moderation is not configured.");
  await service.moderate({ id: input.id, status: input.status, reason: input.reason, actor });
  revalidatePath(`/${input.locale}/studio/comments`);
}
