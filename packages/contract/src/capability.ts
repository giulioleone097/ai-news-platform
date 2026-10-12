import type * as z from "zod/v4";

import {
  BatchValidationError,
  EditorialRuleError,
  type BatchIssue,
  type EditorialErrorCode,
  type RuleParams,
} from "@atlasnews/core/editorial/domain/errors";
import { SocialPublishingError } from "@atlasnews/core/social-publishing/domain/errors";

import type { CapabilityPorts } from "./ports";

/** What a caller may do. An empty `scopes` list on a capability means anonymous access. */
export const scopes = ["newsroom.read", "newsroom.write", "newsroom.publish", "newsroom.admin"] as const;
export type Scope = (typeof scopes)[number];

/** What an editor may do: everything except managing the team. */
const editorScopes: readonly Scope[] = scopes.filter((scope) => scope !== "newsroom.admin");

/**
 * The newsroom scopes of a signed-in person with a profile `role`. Supabase Auth cannot grant custom
 * scopes, so the role decides: editors have the editorial rights, admins also `newsroom.admin` (the
 * team), anyone else gets none. The MCP endpoint and the web app both read this one rule.
 */
export function scopesForRole(role: string | undefined): readonly Scope[] {
  if (role === "admin") return scopes;
  return role === "editor" ? editorScopes : [];
}

/**
 * Where a capability is offered. `mcp` is the MCP endpoint, which carries every data and operation tool.
 * `studio` is the web app's own Server Actions (`runEditorCapability`), never a browser agent.
 * `page` is a tool of the open web page (WebMCP) that runs in the browser and has no handler here: only
 * page specs carry it, so no WebMCP tool shares a name with an MCP tool.
 */
export type Surface = "mcp" | "studio" | "page";

/** All four MCP tool hints, always explicit so no host has to guess a default. */
export interface Annotations {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
}

export type Principal =
  | { readonly kind: "anonymous"; readonly scopes: readonly Scope[] }
  | {
      readonly kind: "editor";
      readonly subject: string;
      readonly scopes: readonly Scope[];
      /** The author that the editor's writes are attributed to, when the caller names one. */
      readonly authorId?: string;
    };

export const anonymous: Principal = { kind: "anonymous", scopes: [] };

export function hasScopes(principal: Principal, required: readonly Scope[]) {
  return required.every((scope) => principal.scopes.includes(scope));
}

/** Failures of the operations (outbox, newsletter) that have a stable code besides the editorial rules'. */
export const operationErrorCodes = ["social.invalidInput", "social.notConfigured"] as const;
export type CapabilityErrorCode = EditorialErrorCode | (typeof operationErrorCodes)[number];

/** What a failure adds to its English message: a stable code for screens that write their own text, and the values it mentions. */
export interface FailureDetail {
  code?: CapabilityErrorCode;
  params?: RuleParams;
  /** Every rejected item of an all-or-nothing batch. */
  issues?: readonly BatchIssue[];
}

/**
 * An anticipated failure whose message is safe to show to the caller. The message is English, for
 * agents; the Studio shows its own text for the `code` in the editor's language.
 */
export class CapabilityFailure extends Error {
  override readonly name = "CapabilityFailure";
  readonly code?: CapabilityErrorCode;
  readonly params?: RuleParams;
  readonly issues?: readonly BatchIssue[];

  constructor(message: string, detail: FailureDetail = {}) {
    super(message);
    this.code = detail.code;
    this.params = detail.params;
    this.issues = detail.issues;
  }
}

/** The social service's own refusals that a caller can fix; a provider's error says more than a caller should read. */
function socialFailure(error: SocialPublishingError) {
  if (error.code === "invalid_input") return new CapabilityFailure(error.message, { code: "social.invalidInput" });
  if (error.code === "configuration_error") return new CapabilityFailure(error.message, { code: "social.notConfigured" });
  return null;
}

export const sourceUnavailableMessage = "The editorial source is temporarily unavailable.";

/** Asked before a consequential write; hosts without forms fall back to `confirm: true`. */
export interface Confirmation<Input> {
  question(input: Input, ports: CapabilityPorts): string | Promise<string>;
}

/**
 * The declarative half of a capability: everything an adapter needs to describe it.
 * It carries no handler, so the browser view can be built from it alone.
 */
export interface CapabilitySpec<
  I extends z.ZodObject = z.ZodObject,
  O extends z.ZodObject = z.ZodObject,
> {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly input: I;
  readonly output: O;
  readonly annotations: Annotations;
  readonly scopes: readonly Scope[];
  readonly surfaces: readonly Surface[];
  readonly confirmation?: Confirmation<z.output<I>>;
  /** `ui://` resource that renders the result in hosts that support MCP Apps. */
  readonly ui?: string;
  /** Message returned when the handler fails with an unexpected error. */
  readonly unavailableMessage?: string;
}

export interface Capability<
  I extends z.ZodObject = z.ZodObject,
  O extends z.ZodObject = z.ZodObject,
> extends CapabilitySpec<I, O> {
  run(ports: CapabilityPorts, input: z.output<I>, principal: Principal): Promise<z.input<O>>;
}

export function defineSpec<I extends z.ZodObject, O extends z.ZodObject>(
  spec: CapabilitySpec<I, O>,
) {
  return spec;
}

/**
 * Attaches the handler to a spec; the adapters call `run` after scope and confirmation checks.
 * A rule broken in core (`EditorialRuleError`) reaches the caller as a `CapabilityFailure` with its
 * own message and code, so no handler converts errors one by one. So do the social service's input
 * and configuration errors.
 */
export function implement<I extends z.ZodObject, O extends z.ZodObject>(
  spec: CapabilitySpec<I, O>,
  run: Capability<I, O>["run"],
): Capability<I, O> {
  return {
    ...spec,
    async run(ports, input, principal) {
      try {
        return await run(ports, input, principal);
      } catch (error) {
        if (error instanceof EditorialRuleError) {
          const issues = error instanceof BatchValidationError ? error.issues : undefined;
          throw new CapabilityFailure(error.message, { code: error.code, params: error.params, issues });
        }
        if (error instanceof SocialPublishingError) throw socialFailure(error) ?? error;
        throw error;
      }
    },
  };
}
