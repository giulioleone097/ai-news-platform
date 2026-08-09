import {
  adminMcpMethodNotAllowedResponse,
  handleAdminMcpRequest,
} from "@/modules/mcp/admin-http";
import { getAdminArticleRepository } from "@/modules/editorial/infrastructure/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleAdminMcpRequest(request, getAdminArticleRepository);
}

export const GET = adminMcpMethodNotAllowedResponse;
export const PUT = adminMcpMethodNotAllowedResponse;
export const PATCH = adminMcpMethodNotAllowedResponse;
export const DELETE = adminMcpMethodNotAllowedResponse;
export const OPTIONS = adminMcpMethodNotAllowedResponse;
