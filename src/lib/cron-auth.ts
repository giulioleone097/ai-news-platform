import { timingSafeEqual } from "node:crypto";

import { getCronSecret } from "@/config/env";

export type CronAuthorization =
  | { ok: true }
  | { ok: false; status: 401 | 503 };

function constantTimeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.byteLength === rightBytes.byteLength
    && timingSafeEqual(leftBytes, rightBytes);
}

export function authorizeCronRequest(request: Request): CronAuthorization {
  const secret = getCronSecret();
  if (!secret) return { ok: false, status: 503 };

  const authorization = request.headers.get("authorization") ?? "";
  return constantTimeEqual(authorization, `Bearer ${secret}`)
    ? { ok: true }
    : { ok: false, status: 401 };
}
