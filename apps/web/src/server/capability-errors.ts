import type { CapabilityErrorCode } from "@atlasnews/contract";
import type { BatchIssue, RuleParams } from "@atlasnews/core/editorial/domain/errors";
import { getMessages, type Locale } from "@/i18n";

/** The refusals the runner itself raises, keyed as `studio.refusals` in the catalogues. */
export type RefusalKey = keyof ReturnType<typeof getMessages>["studio"]["refusals"];

/** What a `CapabilityFailure` carries besides its English message. */
export interface FailureDetail {
  code?: CapabilityErrorCode;
  params?: RuleParams;
  issues?: readonly BatchIssue[];
}

/** The catalogue text of a rule code in the editor's language, with the failure's values filled in. */
export function ruleErrorText(locale: Locale, code: CapabilityErrorCode, params: RuleParams = {}) {
  const { ruleErrors, languageNames } = getMessages(locale).studio;
  const text = ruleErrors[code];
  const template = typeof text === "string"
    ? text
    : new Intl.PluralRules(locale).select(Number(params.count)) === "one" ? text.one : text.other;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params[name];
    if (value === undefined) return placeholder;
    return name === "locale" ? languageNames[value as Locale] ?? String(value) : String(value);
  });
}

/**
 * What the Studio shows for a failed capability: the text of its code, or for a rejected batch the
 * count and each item's own text, and a plain refusal when the failure has no code. Never the English message.
 */
export function failureText(locale: Locale, { code, params, issues }: FailureDetail) {
  const { refusals } = getMessages(locale).studio;
  if (issues?.length) {
    const lines = issues.map(({ index, label, code: issueCode, params: issueParams }) =>
      `#${index}${label ? ` (${label})` : ""}: ${issueCode ? ruleErrorText(locale, issueCode, issueParams) : refusals.refused}`);
    return `${ruleErrorText(locale, "batch.rejected", { count: issues.length })} ${lines.join(" | ")}`;
  }
  return code ? ruleErrorText(locale, code, params) : refusals.refused;
}
