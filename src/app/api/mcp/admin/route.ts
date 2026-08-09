import {
  adminMcpMethodNotAllowedResponse,
  handleAdminMcpRequest,
} from "@/modules/mcp/admin-http";
import { invalidatePublicEditorialCache } from "@/lib/editorial-cache";
import { getAdminEditorialRepository } from "@/modules/editorial/infrastructure/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export function POST(request: Request) {
  return handleAdminMcpRequest(
    request,
    getAdminEditorialRepository,
    invalidatePublicEditorialCache,
  );
}

export const GET = adminMcpMethodNotAllowedResponse;
export const PUT = adminMcpMethodNotAllowedResponse;
export const PATCH = adminMcpMethodNotAllowedResponse;
export const DELETE = adminMcpMethodNotAllowedResponse;
export const OPTIONS = adminMcpMethodNotAllowedResponse;
