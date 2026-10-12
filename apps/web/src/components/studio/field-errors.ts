import type { z } from "zod";
import type { Locale } from "@/i18n";

const copy = {
  en: {
    required: "Fill in this field.",
    tooShort: (count: number) => `Use at least ${count} characters.`,
    tooLong: (count: number) => `Use at most ${count} characters.`,
    format: "Use lowercase letters, numbers and hyphens.",
    email: "Enter a valid email address.",
    invalid: "Check this field.",
  },
  it: {
    required: "Compila questo campo.",
    tooShort: (count: number) => `Usa almeno ${count} caratteri.`,
    tooLong: (count: number) => `Usa al massimo ${count} caratteri.`,
    format: "Usa lettere minuscole, numeri e trattini.",
    email: "Inserisci un indirizzo email valido.",
    invalid: "Controlla questo campo.",
  },
} as const;

/**
 * What a form shows under a field after the server rejected it: one plain sentence per problem, in the
 * editor's language, instead of the validator's own wording. A message the schema wrote itself (a custom
 * rule) is already meant for the editor and is kept.
 */
export function studioFieldErrors(error: z.ZodError, locale: Locale): Record<string, string[]> {
  const words = copy[locale];
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    if (!field) continue;
    let message: string = words.invalid;
    if (issue.code === "custom") message = issue.message;
    else if (issue.code === "too_small" && typeof issue.minimum === "number") message = issue.minimum === 1 ? words.required : words.tooShort(issue.minimum);
    else if (issue.code === "too_big" && typeof issue.maximum === "number") message = words.tooLong(issue.maximum);
    else if (issue.code === "invalid_format") message = issue.format === "email" ? words.email : words.format;
    const messages = (result[field] ??= []);
    if (!messages.includes(message)) messages.push(message);
  }
  return result;
}
