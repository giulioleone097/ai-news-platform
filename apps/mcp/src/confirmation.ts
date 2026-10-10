import type { CallToolResult, InputRequiredResult, ServerContext } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { supportsOpenAiForms } from "./apps/briefing";
import { failure } from "./results";

export const confirmationKey = "confirm_action";

/** Added to the description of every tool that asks first, so models know the fallback. */
export const confirmationNote =
  " Asks the user to confirm first; where the host cannot show a confirmation form, call it again with confirm: true after the user agrees.";

const answerSchema = z.object({
  action: z.enum(["accept", "decline", "cancel"]),
  content: z.object({ confirm: z.literal(true) }).partial().optional(),
});

const confirmSchema = {
  type: "object" as const,
  properties: {
    confirm: { type: "boolean" as const, title: "Confirm", description: "Check to go ahead." },
  },
  required: ["confirm"] as string[],
};

function supportsCoreForms(envelope: ServerContext["mcpReq"]["envelope"]) {
  const meta = (envelope ?? {}) as Record<string, unknown>;
  const version = meta["io.modelcontextprotocol/protocolVersion"];
  const capabilities = meta["io.modelcontextprotocol/clientCapabilities"] as
    | { elicitation?: { form?: object } }
    | undefined;
  return typeof version === "string" && version >= "2026-07-28" && Boolean(capabilities?.elicitation?.form);
}

function form(message: string): InputRequiredResult {
  return {
    resultType: "input_required",
    inputRequests: {
      [confirmationKey]: {
        method: "elicitation/create",
        params: { mode: "form", message, requestedSchema: confirmSchema },
      },
    },
  };
}

function openAiForm(message: string): InputRequiredResult {
  return {
    resultType: "input_required",
    inputRequests: {
      [confirmationKey]: {
        method: "elicitation/create",
        params: {
          mode: "form",
          message,
          // OpenAI-registered servers carry the real schema in _meta; the core form stays empty.
          requestedSchema: { type: "object", properties: {} },
          _meta: { "openai/elicitation": { requestedSchema: confirmSchema } },
        },
      },
    },
  };
}

/**
 * Returns the result to send back instead of running the tool, or null when the user has
 * confirmed. Hosts that can render a form (multi-round-trip) are always asked, whatever the
 * arguments say; other hosts keep the `confirm: true` argument.
 */
export function gateOnConfirmation(
  context: ServerContext,
  confirmArgument: boolean | undefined,
  question: () => Promise<string>,
): Promise<CallToolResult | InputRequiredResult | null> {
  const envelope = context.mcpReq.envelope;
  const openAi = supportsOpenAiForms(envelope);
  if (!openAi && !supportsCoreForms(envelope)) {
    return Promise.resolve(confirmArgument === true
      ? null
      : failure("Explicit confirmation is required. Ask the user, then call again with confirm: true."));
  }

  const response = context.mcpReq.inputResponses?.[confirmationKey];
  if (response === undefined) {
    return question().then(openAi ? openAiForm : form);
  }
  const answer = answerSchema.safeParse(response);
  return Promise.resolve(answer.success && answer.data.action === "accept" && answer.data.content?.confirm === true
    ? null
    : failure("The user did not confirm. Nothing was changed."));
}
