import type { Locale } from "@/i18n";

const dateFormatters: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }),
  it: new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }),
};

const timeFormatters: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }),
  it: new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }),
};

export function formatArticleDate(value: string | null, locale: Locale) {
  return value ? dateFormatters[locale].format(new Date(value)) : "—";
}

export function formatArticleTime(value: string | null, locale: Locale) {
  return value ? timeFormatters[locale].format(new Date(value)) : "—";
}
