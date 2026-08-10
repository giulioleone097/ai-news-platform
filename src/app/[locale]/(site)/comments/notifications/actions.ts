"use server";

import { redirect } from "next/navigation";
import * as z from "zod/v4";
import { getCommentEnvironment } from "@/config/env";
import { locales } from "@/i18n";
import { createMutationCommentService } from "@/modules/comments/infrastructure/container";
import {
  hashCommentSecret,
  verifyNotificationToken,
} from "@/modules/comments/infrastructure/identity-token";

const inputSchema = z.object({
  locale: z.enum(locales),
  token: z.string().trim().min(80).max(256),
});

async function mutateNotificationPreference(
  operation: "verify" | "unsubscribe",
  formData: FormData,
) {
  const parsed = inputSchema.safeParse({
    locale: formData.get("locale"),
    token: formData.get("token"),
  });
  const locale = parsed.success ? parsed.data.locale : "en";
  const path = `/${locale}/comments/notifications/${operation}`;
  if (!parsed.success) redirect(`${path}?status=invalid`);

  const environment = getCommentEnvironment();
  const subscriptionId = environment
    ? verifyNotificationToken(parsed.data.token, environment.guestSecret)
    : null;
  const service = createMutationCommentService();
  if (!environment || !subscriptionId || !service) redirect(`${path}?status=invalid`);

  try {
    if (operation === "verify") {
      await service.verifyNotificationSubscription(
        subscriptionId,
        hashCommentSecret(parsed.data.token),
      );
    } else {
      await service.unsubscribeNotificationSubscription(
        subscriptionId,
        hashCommentSecret(parsed.data.token),
      );
    }
  } catch {
    redirect(`${path}?status=invalid`);
  }
  redirect(`${path}?status=success`);
}

export async function verifyCommentNotificationsAction(formData: FormData) {
  return mutateNotificationPreference("verify", formData);
}

export async function unsubscribeCommentNotificationsAction(formData: FormData) {
  return mutateNotificationPreference("unsubscribe", formData);
}
