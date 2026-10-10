import "server-only";

import { revalidatePath } from "next/cache";
import { getPublicSiteUrl } from "@atlasnews/adapters/config/env";
import {
  capabilities,
  CapabilityFailure,
  hasScopes,
  scopesForRole,
  siteLinks,
  sourceUnavailableMessage,
  type CapabilityPorts,
  type Principal,
} from "@atlasnews/contract";
import { locales, type Locale } from "@atlasnews/core/locale";
import { getEditorIdentity } from "@/lib/editor-auth";
import { invalidatePublicEditorialCache } from "@/lib/editorial-cache";
import { getPublicEditorialRepositories, getStudioAdminEditorialRepository } from "@/server/composition";

/**
 * Runs one catalogue capability (`@atlasnews/contract`) for the editor who is signed in to the
 * Studio. This is the only way web code reaches the content capabilities: the Studio screens call
 * it from Server Actions, and `POST /api/capabilities/{name}` calls it for the page's site tools,
 * so the Studio, WebMCP and the MCP endpoint all run the same handlers.
 */
export type CapabilityRunResult =
  | { ok: true; result: Record<string, unknown> }
  | {
      ok: false;
      /**
       * 400 invalid arguments or a refused rule, 401 nobody signed in, 403 signed in without the
       * scope, 404 unknown capability, 409 the capability needs confirmation first, 503 storage
       * is not configured.
       */
      status: 400 | 401 | 403 | 404 | 409 | 503;
      error: string;
    };

export interface CapabilityRunOptions {
  /** True only when a person approved this exact action in the page (publishing, deleting). */
  confirmed?: boolean;
}

/** Only capabilities offered to the page run here; the rest of the catalogue is MCP-only. */
const pageCapabilities = new Map(
  capabilities.filter((capability) => capability.surfaces.includes("page")).map((capability) => [capability.name, capability]),
);

/** Studio screens that list content, refreshed after a write next to the public pages. */
const studioSections = ["", "/articles", "/entities", "/categories", "/media"] as const;

const fail = (status: 400 | 401 | 403 | 404 | 409 | 503, error: string): CapabilityRunResult => ({
  ok: false,
  status,
  error,
});

/** Stands in for the ports that only MCP capabilities use; no page capability reaches them. */
const notOnThePage = () => Promise.reject(new CapabilityFailure("This capability is not available here."));

/**
 * The ports of a page capability. Writes go through the editor's own session (RLS applies; in
 * demo mode the in-memory repository), reads of published content through the public repositories.
 * Cache invalidations are collected, so a run refreshes each locale once however often a handler asks.
 */
function createPorts(invalidations: Map<Locale, Set<string>>): CapabilityPorts {
  const publicRepositories = getPublicEditorialRepositories();
  return {
    site: siteLinks(getPublicSiteUrl()),
    articles: publicRepositories.articles,
    entities: publicRepositories.entities,
    invalidateCache({ locale, slugs }) {
      const known = invalidations.get(locale) ?? new Set<string>();
      for (const slug of slugs) known.add(slug);
      invalidations.set(locale, known);
    },
    editorial: getStudioAdminEditorialRepository,
    publicComments: notOnThePage,
    moderation: notOnThePage,
    commentNotifications: notOnThePage,
    newsletter: notOnThePage,
    social: notOnThePage,
  };
}

/** The one place a successful write refreshes the public caches and the Studio screens. */
function refreshAfterWrite(invalidations: Map<Locale, Set<string>>) {
  try {
    for (const locale of locales) {
      const slugs = invalidations.get(locale);
      if (!slugs) continue;
      invalidatePublicEditorialCache({ locale, slugs: [...slugs] });
      for (const section of studioSections) revalidatePath(`/${locale}/studio${section}`);
    }
  } catch (error) {
    // The write is already saved; the pages catch up on their own revalidate windows.
    console.error("capabilities: cache refresh failed", error);
  }
}

export async function runEditorCapability(
  name: string,
  input: unknown,
  options: CapabilityRunOptions = {},
): Promise<CapabilityRunResult> {
  const editor = await getEditorIdentity();
  if (!editor) return fail(401, "Sign in to the Studio with an editor account.");

  const capability = pageCapabilities.get(name);
  if (!capability) return fail(404, `Unknown capability ${name}.`);

  const principal: Principal = {
    kind: "editor",
    subject: editor.userId,
    scopes: scopesForRole(editor.role),
  };
  if (!hasScopes(principal, capability.scopes)) {
    return fail(403, `This account lacks the ${capability.scopes.join(", ")} permission that ${name} needs.`);
  }

  const parsed = capability.input.safeParse(input ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`);
    return fail(400, `Invalid arguments for ${name}. ${issues.join("; ")}`);
  }

  const invalidations = new Map<Locale, Set<string>>();
  try {
    const ports = createPorts(invalidations);
    // `confirmed` asserts that a person approved this action; like `confirm: true` on the MCP
    // endpoint it replaces the confirmation form. Without it the question is returned, nothing runs.
    if (capability.confirmation && options.confirmed !== true) {
      return fail(409, await capability.confirmation.question(parsed.data as never, ports));
    }
    const result = await capability.run(ports, parsed.data as never, principal);
    refreshAfterWrite(invalidations);
    return { ok: true, result: result as Record<string, unknown> };
  } catch (error) {
    if (error instanceof CapabilityFailure) return fail(400, error.message);
    console.error(`capabilities: ${name} failed`, error);
    return fail(503, capability.unavailableMessage ?? sourceUnavailableMessage);
  }
}
