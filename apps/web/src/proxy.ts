import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getContentMode, getSupabaseEnvironment } from "@atlasnews/adapters/config/env";
import { isLocale, locales } from "@/i18n";
import { preferredLocale } from "@/lib/accept-language";

const PUBLIC_FILE = /\.[a-z0-9]+$/i;

const localePattern = locales.join("|");
const agentRewrites: Array<{ pattern: RegExp; target: (match: RegExpMatchArray) => string }> = [
  {
    pattern: new RegExp(`^/(${localePattern})/articles/([a-z0-9-]+)\\.md$`),
    target: ([, locale, slug]) => `/${locale}/md/articles/${slug}`,
  },
  {
    pattern: new RegExp(`^/(${localePattern})/entities/([a-z0-9-]+)\\.md$`),
    target: ([, locale, slug]) => `/${locale}/md/entities/${slug}`,
  },
  {
    pattern: new RegExp(`^/(${localePattern})/entities/([a-z0-9-]+)/feed\\.xml$`),
    target: ([, locale, slug]) => `/${locale}/entity-feed/${slug}`,
  },
];

/** Agent-facing URLs (`.md`, entity feeds) served by route handlers under the same locale. */
function agentRewritePath(pathname: string) {
  for (const { pattern, target } of agentRewrites) {
    const match = pathname.match(pattern);
    if (match) return target(match);
  }
  return null;
}

/** The OAuth consent page is a fixed address that Supabase Auth redirects to; it picks its own language. */
function isOAuthPath(pathname: string) {
  return pathname === "/oauth" || pathname.startsWith("/oauth/");
}

function shouldLocalize(pathname: string) {
  return !pathname.startsWith("/api/")
    && pathname !== "/api"
    && !isOAuthPath(pathname)
    && !pathname.startsWith("/_next/")
    && !PUBLIC_FILE.test(pathname);
}

function isAuthSensitivePath(pathname: string) {
  if (isOAuthPath(pathname)) return true;
  const [, localeSegment, section] = pathname.split("/");
  return isLocale(localeSegment)
    && (section === "studio" || section === "login" || section === "auth");
}

/**
 * Pages that must never be framed get `X-Frame-Options: DENY`; next.config.ts adds `frame-ancestors 'none'`
 * for the same paths and the general SAMEORIGIN rule, which this overrides.
 */
function withFramingPolicy(response: NextResponse, pathname: string) {
  if (isAuthSensitivePath(pathname)) response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export async function proxy(request: NextRequest) {
  return withFramingPolicy(await route(request), request.nextUrl.pathname);
}

async function route(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const rewritePath = agentRewritePath(pathname);
  if (rewritePath) {
    const destination = request.nextUrl.clone();
    destination.pathname = rewritePath;
    return NextResponse.rewrite(destination);
  }

  if (shouldLocalize(pathname)) {
    const localeSegment = pathname.split("/")[1];
    if (!isLocale(localeSegment)) {
      // The language is the browser's choice, so the redirect is temporary and varies by that header.
      const locale = preferredLocale(request.headers.get("accept-language"));
      const destination = request.nextUrl.clone();
      destination.pathname = pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
      const redirect = NextResponse.redirect(destination, 307);
      redirect.headers.append("Vary", "Accept-Language");
      return redirect;
    }
  }

  const localeSegment = pathname.split("/")[1];
  const requestHeaders = new Headers(request.headers);
  if (isLocale(localeSegment)) requestHeaders.set("x-atlasnews-locale", localeSegment);

  const nextResponse = () => NextResponse.next({
    request: { headers: requestHeaders },
  });
  if (!isAuthSensitivePath(pathname)) return nextResponse();

  // Only Supabase Auth keeps a session in cookies; on Sites the platform signs people in.
  const environment = getContentMode() === "supabase" ? getSupabaseEnvironment() : null;
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
