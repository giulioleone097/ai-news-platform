import { describe, expect, it } from "vitest";
import { getOAuthRedirectHosts } from "./env";
import { isAllowedRedirectUri } from "./oauth-redirect";

const defaults = getOAuthRedirectHosts();

describe("isAllowedRedirectUri", () => {
  it("accepts the hosts of the supported clients over HTTPS and loopback over HTTP", () => {
    for (const uri of [
      "https://claude.ai/api/mcp/auth_callback",
      "https://chatgpt.com/connector/oauth/abc123",
      "http://localhost:51234/callback",
      "http://127.0.0.1:8080/cb",
      "http://[::1]:9000/cb",
    ]) expect(isAllowedRedirectUri(uri, defaults), uri).toBe(true);
  });

  it("refuses look-alike hosts, plain HTTP off loopback, credentials and custom schemes", () => {
    for (const uri of [
      "https://claude.ai.attacker.example/cb",
      "https://attacker.example/claude.ai",
      "https://xclaude.ai/cb",
      "https://claude.ai@attacker.example/cb",
      "https://user:pw@claude.ai/cb",
      "http://claude.ai/cb",
      "https://localhost.attacker.example/cb",
      "cursor://anysphere.cursor/cb",
      "javascript:alert(1)",
      "not a url",
      "",
    ]) expect(isAllowedRedirectUri(uri, defaults), uri).toBe(false);
  });

  it("matches a wildcard entry on subdomains only", () => {
    const hosts = ["*.example.com"];
    expect(isAllowedRedirectUri("https://app.example.com/cb", hosts)).toBe(true);
    expect(isAllowedRedirectUri("https://example.com/cb", hosts)).toBe(false);
    expect(isAllowedRedirectUri("https://badexample.com/cb", hosts)).toBe(false);
  });
});
