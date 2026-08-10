import { describe, expect, it } from "vitest";
import {
  createCommentRequestSchema,
  publicCommentQuerySchema,
  reportCommentRequestSchema,
} from "./schemas";

const articleId = "f0d16765-a03d-4c55-9e1c-fd6c6c87557f";

describe("comment request boundaries", () => {
  it("normalizes a minimal English-first comment without inventing notification consent", () => {
    expect(createCommentRequestSchema.parse({
      articleId,
      locale: "en",
      displayName: "Ada",
      body: "A useful perspective.",
    })).toEqual({
      articleId,
      locale: "en",
      parentId: null,
      displayName: "Ada",
      body: "A useful perspective.",
      website: "",
      notifications: null,
    });
  });

  it("requires an explicit valid email and at least one opt-in preference", () => {
    const base = {
      articleId,
      locale: "en",
      displayName: "Ada",
      body: "A useful perspective.",
    };
    expect(createCommentRequestSchema.safeParse({
      ...base,
      notifications: { email: "not-an-email", onReplies: true, onModeration: false },
    }).success).toBe(false);
    expect(createCommentRequestSchema.safeParse({
      ...base,
      notifications: { email: "ada@example.com", onReplies: false, onModeration: false },
    }).success).toBe(false);
  });

  it("bounds public pagination and report detail payloads", () => {
    expect(publicCommentQuerySchema.safeParse({ articleId, locale: "fr", limit: 100 }).success)
      .toBe(false);
    expect(reportCommentRequestSchema.safeParse({
      reason: "other",
      details: "x".repeat(501),
    }).success).toBe(false);
  });
});
