import { describe, expect, it } from "vitest";
import { chatGPTSignInPath, signInPath, signOutPath } from "./paths";
import { localeOfPath, safeReturnPath } from "./return-path";

describe("safeReturnPath", () => {
  it("keeps same-site paths with their query and hash", () => {
    expect(safeReturnPath("/en/articles/x?page=2#comments")).toBe("/en/articles/x?page=2#comments");
    expect(safeReturnPath("/it/studio")).toBe("/it/studio");
    expect(safeReturnPath("/")).toBe("/");
  });

  it("turns anything that could leave the site into /", () => {
    for (const value of [
      null,
      undefined,
      "",
      "en/articles",
      "https://evil.example/en",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "///evil.example",
      "javascript:alert(1)",
      "/%2F%2Fevil.example/../..//evil.example",
    ]) {
      const path = safeReturnPath(value);
      expect(path.startsWith("//"), String(value)).toBe(false);
      expect(path === "/" || path.startsWith("/"), String(value)).toBe(true);
      expect(new URL(path, "https://site.test").origin, String(value)).toBe("https://site.test");
    }
    expect(safeReturnPath("//evil.example")).toBe("/");
    expect(safeReturnPath("/\\evil.example")).toBe("/");
  });

  it("never returns to a platform or auth path", () => {
    for (const path of [
      "/signin-with-chatgpt",
      "/signout-with-chatgpt?return_to=/",
      "/callback",
      "/api/auth/signout",
      "/api/auth/google/callback?code=x",
      "/api/auth",
    ]) {
      expect(safeReturnPath(path), path).toBe("/");
    }
  });
});

describe("localeOfPath", () => {
  it("reads the language from the first segment", () => {
    expect(localeOfPath("/it/articles/x")).toBe("it");
    expect(localeOfPath("/en?x=1")).toBe("en");
    expect(localeOfPath("/")).toBe("en");
    expect(localeOfPath("/fr/articles")).toBe("en");
  });
});

describe("sign-in and sign-out paths", () => {
  it("send ChatGPT to the platform and the others to our routes, with a safe return path", () => {
    expect(signInPath("chatgpt", "/en/studio")).toBe("/signin-with-chatgpt?return_to=%2Fen%2Fstudio");
    expect(signInPath("google", "/en/articles/x#comments")).toBe("/api/auth/google/start?return_to=%2Fen%2Farticles%2Fx%23comments");
    expect(signInPath("github", "https://evil.example")).toBe("/api/auth/github/start?return_to=%2F");
    expect(signOutPath("chatgpt", "/en")).toBe("/signout-with-chatgpt?return_to=%2Fen");
    expect(signOutPath("google", "//evil.example")).toBe("/api/auth/signout?return_to=%2F");
    expect(signOutPath("email", "/en")).toBe("/api/auth/signout?return_to=%2Fen");
    expect(chatGPTSignInPath("/callback")).toBe("/signin-with-chatgpt?return_to=%2F");
  });
});
