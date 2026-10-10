import type { Locale } from "@/i18n";

const tags: Record<Locale, string> = { en: "en-GB", it: "it-IT" };

const formatters = {
  day: (locale: Locale) => new Intl.DateTimeFormat(tags[locale], { day: "numeric", month: "long", timeZone: "UTC" }),
  short: (locale: Locale) => new Intl.DateTimeFormat(tags[locale], { day: "numeric", month: "short", timeZone: "UTC" }),
  date: (locale: Locale) => new Intl.DateTimeFormat(tags[locale], { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
  time: (locale: Locale) => new Intl.DateTimeFormat(tags[locale], { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }),
};

const cache = new Map<string, Intl.DateTimeFormat>();

function format(kind: keyof typeof formatters, locale: Locale, value: string | Date) {
  const key = `${kind}:${locale}`;
  let formatter = cache.get(key);
  if (!formatter) {
    formatter = formatters[kind](locale);
    cache.set(key, formatter);
  }
  return formatter.format(typeof value === "string" ? new Date(value) : value);
}

/** "8 August" for a UTC day (`YYYY-MM-DD`). */
export const formatDay = (day: string, locale: Locale) => format("day", locale, `${day}T00:00:00Z`);
/** "8 Aug". */
export const formatShortDate = (iso: string, locale: Locale) => format("short", locale, iso);
/** "10:34", in UTC like every time on the site. */
export const formatTime = (iso: string, locale: Locale) => format("time", locale, iso);
/** "8 Aug 2026". */
export const formatDate = (iso: string, locale: Locale) => format("date", locale, iso);
