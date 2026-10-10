"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import type { StudioActionState } from "@/components/studio/action-state";
import { normalizeLocale } from "@/i18n";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authorizationIdPattern, consentPath, isEditorProfile, isRedirectAllowed, redirectHost } from "./authorization";
import { consentCopy } from "./copy";

async function currentCopy() {
  return consentCopy[normalizeLocale((await headers()).get("accept-language"))];
}

const signInSchema = z.object({
  authorizationId: z.string().regex(authorizationIdPattern),
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
});

/** Signs the editor in on the consent page and returns to the same authorization request. */
export async function signInForConsent(
  _previous: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  const copy = await currentCopy();
  const parsed = signInSchema.safeParse({
    authorizationId: formData.get("authorizationId"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { status: "error", message: copy.invalidCredentials };

  const client = await createServerSupabaseClient();
  if (!client) return { status: "error", message: copy.unavailable };

  const { data, error } = await client.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) return { status: "error", message: copy.invalidCredentials };

  redirect(consentPath(parsed.data.authorizationId));
}

const decisionSchema = z.object({
  authorizationId: z.string().regex(authorizationIdPattern),
  decision: z.enum(["approve", "deny"]),
});

/** Records the editor's answer with Supabase Auth, which builds the redirect back to the application. */
export async function decideAuthorization(
  _previous: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  const copy = await currentCopy();
  const parsed = decisionSchema.safeParse({
    authorizationId: formData.get("authorizationId"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) return { status: "error", message: copy.invalidRequest };

  const client = await createServerSupabaseClient();
  if (!client) return { status: "error", message: copy.unavailable };

  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return { status: "error", message: copy.invalidRequest };

  // The page hides the button from non-editors; the decision is checked again here.
  if (parsed.data.decision === "approve" && !(await isEditorProfile(client, auth.user.id))) {
    return { status: "error", message: copy.notAnEditor };
  }

  // Read the request from Supabase rather than from the form: the redirect address is not the page's to claim.
  if (parsed.data.decision === "approve") {
    const { data: details } = await client.auth.oauth.getAuthorizationDetails(parsed.data.authorizationId);
    if (!details) return { status: "error", message: copy.expiredRequest };
    const target = "redirect_uri" in details ? details.redirect_uri : details.redirect_url;
    if (!isRedirectAllowed(target)) {
      return { status: "error", message: copy.redirectNotAllowed(redirectHost(target)) };
    }
  }

  const options = { skipBrowserRedirect: true };
  const { data, error } = parsed.data.decision === "approve"
    ? await client.auth.oauth.approveAuthorization(parsed.data.authorizationId, options)
    : await client.auth.oauth.denyAuthorization(parsed.data.authorizationId, options);
  if (error || !data?.redirect_url) return { status: "error", message: copy.expiredRequest };

  redirect(data.redirect_url);
}

export async function signOutOfConsent(formData: FormData) {
  const authorizationId = z.string().regex(authorizationIdPattern).safeParse(formData.get("authorizationId"));
  const client = await createServerSupabaseClient();
  if (client) await client.auth.signOut();
  redirect(authorizationId.success ? consentPath(authorizationId.data) : "/");
}
