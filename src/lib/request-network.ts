import { isIP } from "node:net";

export function getRequestNetworkAddress(headers: Headers) {
  const forwarded = headers.get("x-vercel-forwarded-for")
    ?? headers.get("cf-connecting-ip")
    ?? headers.get("x-forwarded-for")
    ?? headers.get("x-real-ip")
    ?? "unknown";
  const candidate = forwarded.split(",", 1)[0]?.trim().slice(0, 96) || "unknown";
  return isIP(candidate) ? candidate.toLowerCase() : "unknown";
}
