import {
  handleMcpRequest,
  mcpMethodNotAllowedResponse,
  mcpOptionsResponse,
} from "../http";
import { defaultAccessTokenVerifier } from "../auth";
import { createRuntimePorts } from "../runtime-ports";

const verifier = defaultAccessTokenVerifier();

export function POST(request: Request) {
  return handleMcpRequest(request, { verifier, createPorts: createRuntimePorts });
}

export const GET = mcpMethodNotAllowedResponse;
export const DELETE = mcpMethodNotAllowedResponse;
export const OPTIONS = mcpOptionsResponse;
