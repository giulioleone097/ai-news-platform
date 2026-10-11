import type { Metadata } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import "../design.tokens.css";
import "../globals.css";
import { normalizeLocale } from "@/i18n";

// The consent page is not under /[locale]: Supabase Auth sends the browser to one fixed path.
const grotesk = localFont({
  src: "../../../node_modules/@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
  preload: false,
  style: "normal",
  weight: "400 900",
});

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function OAuthLayout({ children }: { children: React.ReactNode }) {
  const locale = normalizeLocale((await headers()).get("accept-language"));
  return (
    <html
      lang={locale}
      style={{
        "--font-ui": grotesk.style.fontFamily,
      } as React.CSSProperties}
    >
      <body>{children}</body>
    </html>
  );
}
