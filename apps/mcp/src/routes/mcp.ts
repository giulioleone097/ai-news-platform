import {
  handleMcpRequest,
  mcpMethodNotAllowedResponse,
  mcpOptionsResponse,
} from "../http";
import { apiKeyVerifier } from "../auth";
import { createRuntimePorts } from "../runtime-ports";

// The shared API key is the only verifier today; an OAuth JWT verifier joins it behind the same port.
const verifier = apiKeyVerifier();

export function POST(request: Request) {
  return handleMcpRequest(request, { verifier, createPorts: createRuntimePorts });
}

export const GET = mcpMethodNotAllowedResponse;
export const DELETE = mcpMethodNotAllowedResponse;
export const OPTIONS = mcpOptionsResponse;
