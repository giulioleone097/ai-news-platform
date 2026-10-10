const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const tokenAssignmentPattern = /\b(?:access[_-]?token|token|secret|authorization)\s*[=:]\s*[^\s,;]+/gi;
const jwtPattern = /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}(?:\.[A-Za-z0-9_-]{8,})?\b/g;
const longSecretPattern = /\b[A-Za-z0-9_-]{32,}\b/g;
const phonePattern = /(?<![A-Za-z0-9])\+?[1-9][0-9 ()-]{6,18}[0-9](?![A-Za-z0-9])/g;

export function redactProviderError(value: unknown, fallback = "Provider request failed.") {
  const source = value instanceof Error ? value.message : typeof value === "string" ? value : fallback;
  const redacted = source
    .replace(bearerPattern, "Bearer [redacted]")
    .replace(tokenAssignmentPattern, "credential=[redacted]")
    .replace(jwtPattern, "[redacted-token]")
    .replace(longSecretPattern, "[redacted-secret]")
    .replace(phonePattern, "[redacted-number]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
  return redacted || fallback;
}

export function safeProviderCode(value: unknown, fallback: string) {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const code = String(value).toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").slice(0, 80);
  return code || fallback;
}
