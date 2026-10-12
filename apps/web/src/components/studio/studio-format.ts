import type { Locale } from "@/i18n";

export interface PluralPair {
  one: string;
  other: string;
}

/** "{count} articles": the catalog's one/other pair for `count`, with the number filled in. */
export function plural(locale: Locale, pair: PluralPair, count: number) {
  const form = new Intl.PluralRules(locale).select(count) === "one" ? pair.one : pair.other;
  return form.replace("{count}", String(count));
}

const day = 86_400_000;
const recent = {
  en: {
    now: "just now",
    minutes: (n: number) => `${n} min ago`,
    hours: (n: number) => `${n} h ago`,
    yesterday: "yesterday",
    days: (n: number) => `${n} days ago`,
  },
  it: {
    now: "adesso",
    minutes: (n: number) => `${n} min fa`,
    hours: (n: number) => `${n} h fa`,
    yesterday: "ieri",
    days: (n: number) => `${n} giorni fa`,
  },
} as const;

const dates = {
  en: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
  it: new Intl.DateTimeFormat("it", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
} as const;
const stamps = {
  en: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }),
  it: new Intl.DateTimeFormat("it", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }),
} as const;

/**
 * A Studio date: "2 h ago" or "yesterday" while it is recent, the day otherwise. `title` is always the exact
 * moment, in UTC so the server and the browser print the same text. `now` comes from the caller so a client
 * component renders what the server rendered.
 */
export function whenLabel(value: string | null, locale: Locale, now: number) {
  if (!value) return { text: "—", title: "" };
  const at = new Date(value).getTime();
  const title = `${stamps[locale].format(at)} UTC`;
  const age = now - at;
  const words = recent[locale];
  if (age < 0 || age >= 7 * day) return { text: dates[locale].format(at), title };
  if (age < 60_000) return { text: words.now, title };
  if (age < 3_600_000) return { text: words.minutes(Math.floor(age / 60_000)), title };
  if (age < day) return { text: words.hours(Math.floor(age / 3_600_000)), title };
  const days = Math.floor(now / day) - Math.floor(at / day);
  return { text: days <= 1 ? words.yesterday : words.days(days), title };
}
