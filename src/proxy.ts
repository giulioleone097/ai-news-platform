import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnvironment } from "@/config/env";
import { defaultLocale, isLocale } from "@/i18n";

const PUBLIC_FILE = /\.[a-z0-9]+$/i;

function shouldLocalize(pathname: string) {
  return !pathname.startsWith("/api/")
    && pathname !== "/api"
    && !pathname.startsWith("/_next/")
    && !PUBLIC_FILE.test(pathname);
}

function isAuthSensitivePath(pathname: string) {
  const [, localeSegment, section] = pathname.split("/");
  return isLocale(localeSegment)
    && (section === "studio" || section === "login" || section === "auth");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (shouldLocalize(pathname)) {
    const localeSegment = pathname.split("/")[1];
    if (!isLocale(localeSegment)) {
      const destination = request.nextUrl.clone();
      destination.pathname = pathname === "/"
        ? `/${defaultLocale}`
        : `/${defaultLocale}${pathname}`;
      return NextResponse.redirect(destination, 308);
    }
  }

  const localeSegment = pathname.split("/")[1];
  const requestHeaders = new Headers(request.headers);
  if (isLocale(localeSegment)) requestHeaders.set("x-neura-locale", localeSegment);

  const nextResponse = () => NextResponse.next({
    request: { headers: requestHeaders },
  });
  if (!isAuthSensitivePath(pathname)) return nextResponse();

  const environment = getSupabaseEnvironment();
  if (!environment) return nextResponse();

  let response = nextResponse();
  const client = createServerClient(environment.url, environment.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = nextResponse();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  await client.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)"],
};
