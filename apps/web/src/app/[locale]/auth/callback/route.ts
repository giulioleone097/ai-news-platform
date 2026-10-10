import { NextResponse } from "next/server";
import { isLocale } from "@/i18n";
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

  if (!code || !client) {
    return NextResponse.redirect(new URL(`/${safeLocale}/login?error=callback`, requestUrl));
  }

  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(new URL(`/${safeLocale}/login?error=callback`, requestUrl));
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .in("role", ["editor", "admin"])
    .maybeSingle();

  if (profileError || !profile) {
    await client.auth.signOut();
    return NextResponse.redirect(new URL(`/${safeLocale}/login?error=forbidden`, requestUrl));
  }

  return NextResponse.redirect(new URL(`/${safeLocale}/studio`, requestUrl));
}
