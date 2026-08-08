import {
  handlePublicMcpRequest,
  publicMcpMethodNotAllowedResponse,
  publicMcpOptionsResponse,
} from "@/modules/mcp/http";
import { getPublicEditorialRepositories } from "@/modules/editorial/infrastructure/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { articles } = getPublicEditorialRepositories();
  return handlePublicMcpRequest(request, articles);
}

export function GET(request: Request) {
  return publicMcpMethodNotAllowedResponse(request);
}

export function DELETE(request: Request) {
  return publicMcpMethodNotAllowedResponse(request);
}

export function OPTIONS(request: Request) {
  return publicMcpOptionsResponse(request);
}
