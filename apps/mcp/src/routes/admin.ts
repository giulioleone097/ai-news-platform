import {
  adminMcpMethodNotAllowedResponse,
  handleAdminMcpRequest,
} from "../admin-http";
import type { EditorialCacheInvalidator } from "@atlasnews/core/editorial/application/cache-port";
import { getAdminEditorialRepository } from "@atlasnews/adapters/editorial/container";

// The reader site owns the Next.js cache this port used to purge in-process. This
// standalone server cannot reach it, so the site refreshes on its own revalidate windows.
const invalidatePublicEditorialCache: EditorialCacheInvalidator = () => {};

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
