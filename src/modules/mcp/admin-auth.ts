import { createHash, timingSafeEqual } from "node:crypto";

import { getMcpAdminApiKey } from "@/config/env";

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

export type AdminMcpAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; message: string };

export function authorizeAdminMcpRequest(
  request: Request,
  configuredKey = getMcpAdminApiKey(),
): AdminMcpAuthResult {
  if (!configuredKey) {
    return {
      ok: false,
      status: 503,
      message: "Admin MCP is not configured.",
    };
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) {
    return { ok: false, status: 401, message: "Valid Bearer authentication required." };
  }

  const valid = timingSafeEqual(digest(match[1]), digest(configuredKey));
  return valid
    ? { ok: true }
    : { ok: false, status: 401, message: "Valid Bearer authentication required." };
}
