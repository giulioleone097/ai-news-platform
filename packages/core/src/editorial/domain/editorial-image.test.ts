import { describe, expect, it } from "vitest";
import {
  getEditorialMediaReferenceKey,
  hasExpectedImageSignature,
  hasEditorialImageShape,
  isAllowedEditorialImageSource,
} from "./editorial-image";

describe("editorial image source boundary", () => {
  it("allows bundled media and rejects traversal", () => {
    expect(isAllowedEditorialImageSource("/media/cover.webp")).toBe(true);
    expect(isAllowedEditorialImageSource("/media/../secret.webp")).toBe(false);
  });

  it("allows an upload that the site serves from its own origin, and rejects traversal and other origins", () => {
    expect(isAllowedEditorialImageSource("/media-store/0b6c1c0e-9f1d-4a43-8d3f-0a1f4f0d2c11.webp")).toBe(true);
    expect(isAllowedEditorialImageSource("/media-store/../secret.webp")).toBe(false);
    expect(isAllowedEditorialImageSource("/media-store/nested/cover.webp")).toBe(false);
    expect(isAllowedEditorialImageSource("https://example.com/media-store/cover.webp")).toBe(false);
    expect(getEditorialMediaReferenceKey("/media-store/cover.webp")).toBe("cover.webp");
    expect(getEditorialMediaReferenceKey("/media-store/../cover.webp")).toBeNull();
  });

  it("allows only the configured public editorial bucket", () => {
    const storage = "https://project.supabase.co";
    expect(isAllowedEditorialImageSource(
      "https://project.supabase.co/storage/v1/object/public/editorial-media/cover.webp",
      storage,
    )).toBe(true);
    expect(isAllowedEditorialImageSource("https://images.example.com/cover.webp", storage)).toBe(false);
    expect(isAllowedEditorialImageSource(
      "https://project.supabase.co/storage/v1/object/public/other/cover.webp",
      storage,
    )).toBe(false);
  });

  it("allows no bucket when the deployment configures none, while the shape check only looks at the path", () => {
    const object = "https://project.supabase.co/storage/v1/object/public/editorial-media/cover.webp";
    expect(isAllowedEditorialImageSource(object)).toBe(false);
    expect(isAllowedEditorialImageSource(object, "  ")).toBe(false);
    expect(hasEditorialImageShape(object)).toBe(true);
    expect(hasEditorialImageShape("/media/cover.webp")).toBe(true);
    expect(hasEditorialImageShape("https://images.example.com/cover.webp")).toBe(false);
    expect(hasEditorialImageShape("javascript:alert(1)")).toBe(false);
  });

  it("canonicalizes media references independently of query strings and hashes", () => {
    expect(getEditorialMediaReferenceKey(
      "https://project.supabase.co/storage/v1/object/public/editorial-media/cover.webp?v=1#preview",
    )).toBe("cover.webp");
    expect(getEditorialMediaReferenceKey("/media/cover.webp?v=1")).toBeNull();
  });

  it("allows local HTTP storage only when the configured origin is also HTTP", () => {
    const storage = "http://127.0.0.1:54321";
    expect(isAllowedEditorialImageSource(
      "http://127.0.0.1:54321/storage/v1/object/public/editorial-media/cover.webp",
      storage,
    )).toBe(true);
    expect(isAllowedEditorialImageSource(
      "http://localhost:54321/storage/v1/object/public/editorial-media/cover.webp",
      storage,
    )).toBe(false);
    expect(isAllowedEditorialImageSource(
      "https://127.0.0.1:54321/storage/v1/object/public/editorial-media/cover.webp",
      storage,
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
