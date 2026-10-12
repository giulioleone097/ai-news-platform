import { redirect } from "next/navigation";
import { defaultLocale, isLocale, type Locale } from "@/i18n";
import { runEditorCapability, type CapabilityRunOptions, type CapabilityRunResult } from "@/server/capabilities";

/** The language a Studio form was posted in: its `locale` field, English when it names none we serve. */
export function readLocale(formData: FormData): Locale {
  const value = formData.get("locale");
  return isLocale(value) ? value : defaultLocale;
}

/**
 * How a Studio Server Action runs a catalogue capability: for the signed-in editor, with the scope check,
 * attribution and confirmation every other surface gets, and a refusal in the editor's language. Nobody
 * signed in goes to the login page, as the other Studio screens do; any other refusal is returned.
 * `confirmed` asserts that the person approved this exact action in the page before the form was sent.
 */
export async function runStudioCapability(
  locale: Locale,
  name: string,
  input: unknown,
  options: Omit<CapabilityRunOptions, "locale"> = {},
): Promise<CapabilityRunResult> {
  const outcome = await runEditorCapability(name, input, { ...options, locale });
  if (!outcome.ok && outcome.status === 401) redirect(`/${locale}/login`);
  return outcome;
}
