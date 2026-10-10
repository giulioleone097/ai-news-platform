import { getOpenAiAppsChallenge } from "@atlasnews/adapters/config/env";

/**
 * OpenAI domain verification: the challenge token alone, as plain text. Unset or invalid means 404,
 * so nothing is served until an operator configures a token.
 */
export function GET() {
  const token = getOpenAiAppsChallenge();
  const headers = { "Cache-Control": "no-store" };
  if (!token) return Response.json({ error: "not_found" }, { status: 404, headers });
  return new Response(token, { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
}
