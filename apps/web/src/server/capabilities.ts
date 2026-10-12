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
  type Capability,
  type CapabilityErrorCode,
  type CapabilityPorts,
  type Principal,
} from "@atlasnews/contract";
import { locales, type Locale } from "@atlasnews/core/locale";
import { getMessages } from "@/i18n";
import { getEditorIdentity, isSignedIn } from "@/lib/editor-auth";
import type { EditorIdentity } from "@/lib/editor-identity";
import { invalidatePublicEditorialCache } from "@/lib/editorial-cache";
import { failureText, type RefusalKey } from "@/server/capability-errors";
import {
  createMutationCommentService,
  createSocialPublishingRuntime,
  getNewsletterDeliveryService,
  getPublicEditorialRepositories,
  getStudioAdminEditorialRepository,
  getStudioContactMessageService,
  getStudioEditorDirectory,
  getStudioNewsletterCampaignService,
} from "@/server/composition";

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
       * 400 invalid arguments or a refused rule, 401 nobody signed in, 403 signed in without an
       * editor profile or without the scope, 404 unknown capability, 409 the capability needs confirmation first, 503 a
       * backend (storage, the social outbox) is not configured.
       */
      status: 400 | 401 | 403 | 404 | 409 | 503;
      /** English for agents; in the editor's language when the caller passed a `locale`. */
      error: string;
      /** The rule behind a 400, when it has one. Branch on it, not on the wording. */
      code?: CapabilityErrorCode;
    };

export interface CapabilityRunOptions {
  /** True only when a person approved this exact action in the page (publishing, deleting). */
  confirmed?: boolean;
  /** The language of `error`. Studio screens pass the editor's; without it `error` is English, as agents read it. */
  locale?: Locale;
}

type Refusal = Extract<CapabilityRunResult, { ok: false }>;

/** Only capabilities offered to the page run here; the rest of the catalogue (public reads, workers) is MCP-only. */
const pageCapabilities = new Map(
  capabilities.filter((capability) => capability.surfaces.includes("page")).map((capability) => [capability.name, capability]),
);

/** Studio screens that list content, refreshed after a write next to the public pages. */
const studioSections = ["", "/articles", "/entities", "/categories", "/media"] as const;

/** A refusal: English for agents, the catalogue's text for `key` when the caller asked for a language. */
function refuse(
  options: CapabilityRunOptions,
  status: Refusal["status"],
  english: string,
  key: RefusalKey,
  code?: CapabilityErrorCode,
): Refusal {
  const error = options.locale ? getMessages(options.locale).studio.refusals[key] : english;
  return code ? { ok: false, status, error, code } : { ok: false, status, error };
}

/** Failures that mean a backend is not set up, not that the request was wrong: answered 503 like any unconfigured backend. */
const unavailableCodes: readonly CapabilityErrorCode[] = ["social.notConfigured"];

/** Stands in for the ports that only MCP capabilities use (public comments, the notification worker); no page capability reaches them. */
const notOnThePage = () => Promise.reject(new CapabilityFailure("This capability is not available here."));

/**
 * The ports of a page capability. Writes go through the editor's own session (RLS applies; in
 * demo mode the in-memory repository), reads of published content through the public repositories.
 * Comments, the newsletter and the social outbox are built as the Studio's own actions build them,
 * and fail like any unconfigured backend (a rejected port, so the caller gets the 503 message).
 * Cache invalidations are collected, so a run refreshes each locale once however often a handler asks.
 */
function createPorts(invalidations: Map<Locale, Set<string>>, editorUserId: string): CapabilityPorts {
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
    async moderation() {
      const service = createMutationCommentService();
      if (!service) throw new Error("Comment moderation is not configured.");
      return service;
    },
    commentNotifications: notOnThePage,
    async newsletter() {
      // The campaign is created by the signed-in editor, as in the Studio's campaign form.
      return {
        campaign: await getStudioNewsletterCampaignService(),
        delivery: getNewsletterDeliveryService(),
        authorId: editorUserId,
      };
    },
    async contact() {
      const service = await getStudioContactMessageService();
      if (!service) throw new Error("The contact inbox is not configured.");
      return service;
    },
    social: async () => createSocialPublishingRuntime(),
    team: getStudioEditorDirectory,
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

type EditorAccess = { ok: true; editor: EditorIdentity; principal: Principal; capability: Capability };

/**
 * Who may run `name`, as every caller sees it: 401 with nobody signed in, 403 for a signed-in account
 * without an editor profile or without a scope the capability needs, 404 for a name the page does not offer.
 * `runEditorCapability` starts here. So does a Studio write that cannot be a capability call (the media
 * upload takes the file itself, not base64), so it is refused for the same reasons and not by a copy of the rule.
 */
export async function authorizeEditorCapability(
  name: string,
  options: CapabilityRunOptions = {},
): Promise<EditorAccess | Refusal> {
  const editor = await getEditorIdentity();
  if (!editor) {
    return (await isSignedIn())
      ? refuse(options, 403, "This account is not an editor of the Studio.", "notEditor")
      : refuse(options, 401, "Sign in to the Studio with an editor account.", "signIn");
  }
  const principal: Principal = {
    kind: "editor",
    subject: editor.userId,
    scopes: scopesForRole(editor.role),
    authorId: editor.author.id,
  };
  const capability = pageCapabilities.get(name);
  if (!capability) return refuse(options, 404, `Unknown capability ${name}.`, "unknownAction");
  if (!hasScopes(principal, capability.scopes)) {
    return refuse(options, 403, `This account lacks the ${capability.scopes.join(", ")} permission that ${name} needs.`, "noPermission");
  }
  return { ok: true, editor, principal, capability };
}

export async function runEditorCapability(
  name: string,
  input: unknown,
  options: CapabilityRunOptions = {},
): Promise<CapabilityRunResult> {
  const access = await authorizeEditorCapability(name, options);
  if (!access.ok) return access;
  const { editor, principal, capability } = access;

  const parsed = capability.input.safeParse(input ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`);
    return refuse(options, 400, `Invalid arguments for ${name}. ${issues.join("; ")}`, "invalidInput");
  }

  const invalidations = new Map<Locale, Set<string>>();
  try {
    const ports = createPorts(invalidations, editor.userId);
    // `confirmed` asserts that a person approved this action; like `confirm: true` on the MCP
    // endpoint it replaces the confirmation form. Without it the question is returned, nothing runs.
    if (capability.confirmation && options.confirmed !== true) {
      return refuse(options, 409, await capability.confirmation.question(parsed.data as never, ports), "needsConfirmation");
    }
    const result = await capability.run(ports, parsed.data as never, principal);
    refreshAfterWrite(invalidations);
    return { ok: true, result: result as Record<string, unknown> };
  } catch (error) {
    if (error instanceof CapabilityFailure) {
      const failure = options.locale ? failureText(options.locale, error) : error.message;
      const status = error.code && unavailableCodes.includes(error.code) ? 503 : 400;
      return error.code ? { ok: false, status, error: failure, code: error.code } : { ok: false, status, error: failure };
    }
    console.error(`capabilities: ${name} failed`, error);
    return refuse(options, 503, capability.unavailableMessage ?? sourceUnavailableMessage, "unavailable");
  }
}
