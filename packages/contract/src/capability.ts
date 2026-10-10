import type * as z from "zod/v4";

import type { CapabilityPorts } from "./ports";

/** What a caller may do. An empty `scopes` list on a capability means anonymous access. */
export const scopes = ["newsroom.read", "newsroom.write", "newsroom.publish"] as const;
export type Scope = (typeof scopes)[number];

/** Where a capability is offered: the MCP endpoint, and/or tools of the open web page. */
export type Surface = "mcp" | "page";

/** All four MCP tool hints, always explicit so no host has to guess a default. */
export interface Annotations {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
}

export type Principal =
  | { readonly kind: "anonymous"; readonly scopes: readonly Scope[] }
  | { readonly kind: "editor"; readonly subject: string; readonly scopes: readonly Scope[] };

export const anonymous: Principal = { kind: "anonymous", scopes: [] };

export function hasScopes(principal: Principal, required: readonly Scope[]) {
  return required.every((scope) => principal.scopes.includes(scope));
}

/** An anticipated failure whose message is safe to show to the caller. */
export class CapabilityFailure extends Error {
  override readonly name = "CapabilityFailure";
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

/** Attaches the handler to a spec; the adapters call `run` after scope and confirmation checks. */
export function implement<I extends z.ZodObject, O extends z.ZodObject>(
  spec: CapabilitySpec<I, O>,
  run: Capability<I, O>["run"],
): Capability<I, O> {
  return { ...spec, run };
}
