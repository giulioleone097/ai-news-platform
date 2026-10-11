import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isLocale } from "@/i18n";
import { authCookieNames, authCookieOptions } from "@/lib/auth/cookies";
import { safeReturnPath } from "@/lib/auth/return-path";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const safeLocale = isLocale(locale) ? locale : "en";
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const client = await createServerSupabaseClient();

  // `/api/auth/<provider>/start` left the page to come back to in a cookie; it is spent either way.
  const cookieStore = await cookies();
  const names = authCookieNames();
  const next = safeReturnPath(cookieStore.get(names.next)?.value);
  const redirectTo = (path: string) => {
    const response = NextResponse.redirect(new URL(path, requestUrl));
    response.cookies.set(names.next, "", authCookieOptions(0));
    return response;
  };

  if (!code || !client) {
    return redirectTo(`/${safeLocale}/login?error=callback`);
  }

  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return redirectTo(`/${safeLocale}/login?error=callback`);
  }

  // A reader who signed in from a page (the comment section) comes back to it; they need no editor profile.
  // Without a `next` path, or with one into the Studio, only editors stay signed in.
  const intoStudio = next.split("/")[2]?.split(/[?#]/)[0] === "studio";
  if (next !== "/" && !intoStudio) {
    return redirectTo(next);
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .in("role", ["editor", "admin"])
    .maybeSingle();

  if (profileError || !profile) {
    await client.auth.signOut();
    return redirectTo(`/${safeLocale}/login?error=forbidden`);
  }

  return redirectTo(`/${safeLocale}/studio`);
}
