import { describe, expect, it } from "vitest";

import { canonicalJson, deriveEventId, deriveSubscriptionId } from "./canonical-json";

describe("canonical JSON", () => {
  it("sorts keys recursively and omits undefined members", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: undefined }], c: null } }))
      .toBe('{"a":{"c":null,"d":[3,{"z":1}]},"b":1}');
  });
});

describe("deterministic identifiers", () => {
  const identity = {
    principal: "public",
    url: "https://receiver.example.com/cb",
    name: "article.published",
    arguments: { locale: "en", category: "models" },
  };

  it("derives the same subscription id regardless of argument key order", () => {
    const id = deriveSubscriptionId(identity);
    expect(id).toMatch(/^sub_[0-9a-f]{64}$/);
    expect(deriveSubscriptionId({ ...identity, arguments: { category: "models", locale: "en" } })).toBe(id);
  });

  it("changes the id when any identity part changes", () => {
    const id = deriveSubscriptionId(identity);
    expect(deriveSubscriptionId({ ...identity, url: "https://other.example.com/cb" })).not.toBe(id);
    expect(deriveSubscriptionId({ ...identity, arguments: { locale: "it" } })).not.toBe(id);
    expect(deriveSubscriptionId({ ...identity, principal: "someone" })).not.toBe(id);
  });

  it("derives a stable event id per subscription and article", () => {
    expect(deriveEventId("sub_a", "article-1")).toMatch(/^evt_[0-9a-f]{64}$/);
    expect(deriveEventId("sub_a", "article-1")).toBe(deriveEventId("sub_a", "article-1"));
    expect(deriveEventId("sub_a", "article-1")).not.toBe(deriveEventId("sub_b", "article-1"));
  });
});
