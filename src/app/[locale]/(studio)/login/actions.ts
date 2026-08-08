"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { StudioActionState } from "@/components/studio/action-state";
import { isDemoStudioEnabled } from "@/config/env";
import { getMessages, locales } from "@/i18n";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  locale: z.enum(locales),
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
});

const localeSchema = z.enum(locales);

export async function signInAction(
  _previousState: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  const parsed = loginSchema.safeParse({
    locale: formData.get("locale"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const locale = localeSchema.safeParse(formData.get("locale"));
    const messages = getMessages(locale.success ? locale.data : "en");
    return {
      status: "error",
      message: messages.auth.invalidCredentials,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { locale, email, password } = parsed.data;
  const messages = getMessages(locale);
  const client = await createServerSupabaseClient();
  if (!client) {
    if (isDemoStudioEnabled()) redirect(`/${locale}/studio`);
    return { status: "error", message: messages.auth.unavailable };
  }

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { status: "error", message: messages.auth.invalidCredentials };
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .in("role", ["editor", "admin"])
    .maybeSingle();

  if (profileError || !profile) {
    await client.auth.signOut();
    return { status: "error", message: messages.errors.forbiddenDescription };
  }

  redirect(`/${locale}/studio`);
}

export async function signOutAction(formData: FormData) {
  const locale = localeSchema.catch("en").parse(formData.get("locale"));
  const client = await createServerSupabaseClient();
  if (client) await client.auth.signOut();
  redirect(`/${locale}`);
}
