"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod/v4";
import { isLocale, locales } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { moderationTargetStatuses } from "@atlasnews/core/comments/domain/comment";
import { runStudioCapability } from "@/server/studio-capability";

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
  // The page's own form is the person's confirmation. The capability records the moderator as a user actor.
  const outcome = await runStudioCapability(
    input.locale,
    "admin_moderate_comment",
    { id: input.id, status: input.status, reason: input.reason },
    { confirmed: true },
  );
  if (!outcome.ok) throw new Error(outcome.error);
  revalidatePath(`/${input.locale}/studio/comments`);
}
