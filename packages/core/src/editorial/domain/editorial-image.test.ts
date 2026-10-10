import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getEditorialMediaReferenceKey,
  hasExpectedImageSignature,
  isAllowedEditorialImageSource,
} from "./editorial-image";

afterEach(() => vi.unstubAllEnvs());

describe("editorial image source boundary", () => {
  it("allows bundled media and rejects traversal", () => {
    expect(isAllowedEditorialImageSource("/media/cover.webp")).toBe(true);
    expect(isAllowedEditorialImageSource("/media/../secret.webp")).toBe(false);
  });

  it("allows only the configured public editorial bucket", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    expect(isAllowedEditorialImageSource(
      "https://project.supabase.co/storage/v1/object/public/editorial-media/cover.webp",
    )).toBe(true);
    expect(isAllowedEditorialImageSource("https://images.example.com/cover.webp")).toBe(false);
    expect(isAllowedEditorialImageSource(
      "https://project.supabase.co/storage/v1/object/public/other/cover.webp",
    )).toBe(false);
  });

  it("canonicalizes media references independently of query strings and hashes", () => {
    expect(getEditorialMediaReferenceKey(
      "https://project.supabase.co/storage/v1/object/public/editorial-media/cover.webp?v=1#preview",
    )).toBe("cover.webp");
    expect(getEditorialMediaReferenceKey("/media/cover.webp?v=1")).toBeNull();
  });

  it("allows local HTTP storage only when the configured origin is also HTTP", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    expect(isAllowedEditorialImageSource(
      "http://127.0.0.1:54321/storage/v1/object/public/editorial-media/cover.webp",
    )).toBe(true);
    expect(isAllowedEditorialImageSource(
      "http://localhost:54321/storage/v1/object/public/editorial-media/cover.webp",
    )).toBe(false);
    expect(isAllowedEditorialImageSource(
      "https://127.0.0.1:54321/storage/v1/object/public/editorial-media/cover.webp",
    )).toBe(false);
  });

  it("rejects media whose bytes do not match the claimed type", () => {
    expect(hasExpectedImageSignature(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "image/png",
    )).toBe(true);
    expect(hasExpectedImageSignature(new TextEncoder().encode("<script>alert(1)</script>"), "image/png"))
      .toBe(false);
  });
});
