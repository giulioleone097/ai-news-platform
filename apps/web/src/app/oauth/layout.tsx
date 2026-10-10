import type { Metadata } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import "../design.tokens.css";
import "../globals.css";
import { normalizeLocale } from "@/i18n";

// The consent page is not under /[locale]: Supabase Auth sends the browser to one fixed path.
const inter = localFont({
  src: "../../../../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  display: "swap",
  fallback: ["Inter", "sans-serif"],
  preload: false,
  style: "normal",
  weight: "100 900",
});

const brand = localFont({
  src: "../fonts/barlow-condensed-neura.woff2",
  display: "swap",
  fallback: ["Arial Narrow", "sans-serif"],
  style: "normal",
  weight: "700",
});

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function OAuthLayout({ children }: { children: React.ReactNode }) {
  const locale = normalizeLocale((await headers()).get("accept-language"));
  return (
    <html
      lang={locale}
      style={{
        "--font-brand": brand.style.fontFamily,
        "--font-ui": inter.style.fontFamily,
      } as React.CSSProperties}
    >
      <body>{children}</body>
    </html>
  );
}
