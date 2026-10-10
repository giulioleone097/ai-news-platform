import type { CallToolResult, InputRequiredResult, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  CapabilityFailure,
  hasScopes,
  sourceUnavailableMessage,
  type Capability,
  type CapabilityPorts,
  type Principal,
  type Scope,
} from "@atlasnews/contract";

import { securitySchemes } from "./auth";
import { confirmationNote, gateOnConfirmation } from "./confirmation";
import { failure, success } from "./results";

const confirmField = z
  .boolean()
  .optional()
  .describe("Only for hosts without confirmation forms: true once the user has agreed.");

export interface AdapterDependencies {
  ports: CapabilityPorts;
  principal: Principal;
  /** The Bearer challenge that starts sign-in on hosts that support account linking. */
  challenge(missing: readonly Scope[]): string;
}

function toolMeta(capability: Capability) {
  return {
    securitySchemes: securitySchemes(capability.scopes),
    ...(capability.ui
      ? { ui: { resourceUri: capability.ui }, "ui/resourceUri": capability.ui }
      : {}),
  };
}

function signInRequired(capability: Capability, deps: AdapterDependencies): CallToolResult {
  const missing = capability.scopes.filter((scope) => !deps.principal.scopes.includes(scope));
  return failure(
    deps.principal.kind === "anonymous"
      ? "Sign in to AtlasNews with an editor account to use this tool."
      : `This sign-in lacks the ${missing.join(", ")} permission that this tool needs.`,
    { "mcp/www_authenticate": [deps.challenge(missing)] },
  );
}

/**
 * Registers every catalogue capability on the MCP server. This is the only place that turns
 * a capability into a tool, so names, schemas and hints are never declared a second time.
 */
export function registerCapabilities(
  server: McpServer,
  capabilities: readonly Capability[],
  deps: AdapterDependencies,
) {
  for (const capability of capabilities) {
    if (!capability.surfaces.includes("mcp")) continue;
    const confirming = capability.confirmation !== undefined;

    server.registerTool(
      capability.name,
      {
        title: capability.title,
        description: confirming ? `${capability.description}${confirmationNote}` : capability.description,
        inputSchema: confirming ? capability.input.extend({ confirm: confirmField }) : capability.input,
        outputSchema: capability.output,
        annotations: { ...capability.annotations },
        _meta: toolMeta(capability),
      },
      async (args, context): Promise<CallToolResult | InputRequiredResult> => {
        if (!hasScopes(deps.principal, capability.scopes)) return signInRequired(capability, deps);
        const { confirm, ...input } = args as { confirm?: boolean } & Record<string, unknown>;
        try {
          if (capability.confirmation) {
            const gate = await gateOnConfirmation(context, confirm, async () =>
              capability.confirmation!.question(input as never, deps.ports));
            if (gate) return gate;
          }
          return success(await capability.run(deps.ports, input as never, deps.principal));
        } catch (error) {
          return failure(
            error instanceof CapabilityFailure
              ? error.message
              : capability.unavailableMessage ?? sourceUnavailableMessage,
          );
        }
      },
    );
  }
}
