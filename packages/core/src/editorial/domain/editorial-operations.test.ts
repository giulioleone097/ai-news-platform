import { describe, expect, it } from "vitest";

import {
  canEditorSetNewsletterStatus,
  canonicalArticleUrl,
  findPublication,
  newsletterEditorActions,
  newsletterStatuses,
  type DistributionPublication,
} from "./editorial-operations";

describe("newsletter subscription statuses", () => {
  it("models every status the double opt-in migration can store", () => {
    expect([...newsletterStatuses].sort()).toEqual(["active", "pending", "suppressed", "unsubscribed"]);
  });

  it("offers editors only unsubscribe and a fresh confirmation, never reactivation or un-suppression", () => {
    expect(newsletterEditorActions("pending")).toEqual(["unsubscribe", "reconfirm"]);
    expect(newsletterEditorActions("active")).toEqual(["unsubscribe"]);
    expect(newsletterEditorActions("unsubscribed")).toEqual(["reconfirm"]);
    expect(newsletterEditorActions("suppressed")).toEqual([]);
  });

  it("lets an editor set only `unsubscribed`, and never on a suppressed address", () => {
    for (const from of newsletterStatuses) {
      for (const to of newsletterStatuses) {
        const expected = to === "unsubscribed" && from !== "suppressed";
        expect(canEditorSetNewsletterStatus(from, to), `${from} -> ${to}`).toBe(expected);
      }
    }
  });
});

describe("the publication a social post is about", () => {
  const publication = (id: string, channel: DistributionPublication["channel"]) => ({ id, channel }) as DistributionPublication;
  const listed = [publication("p1", "linkedin"), publication("p2", "x")];

  it("must be one of the listed publications, for the channel the post goes to", () => {
    expect(findPublication(listed, "p2", "x")).toBe(listed[1]);
    expect(findPublication(listed, "p2", "linkedin")).toBeNull();
    expect(findPublication(listed, "other", "x")).toBeNull();
  });

  it("is found by id alone when only the owner matters, as for a job that is cancelled or retried", () => {
    expect(findPublication(listed, "p1")).toBe(listed[0]);
    expect(findPublication([], "p1")).toBeNull();
  });
});

describe("canonicalArticleUrl", () => {
  it("links to the article on a public https site, with the slug encoded", () => {
    expect(canonicalArticleUrl(new URL("https://atlasnews.example"), "it", "una storia")).toBe(
      "https://atlasnews.example/it/articles/una%20storia",
    );
  });

  it("gives no address for a site that is not public https, or that carries credentials", () => {
    expect(canonicalArticleUrl(new URL("http://localhost:3000"), "en", "story")).toBeUndefined();
    expect(canonicalArticleUrl(new URL("https://user:secret@atlasnews.example"), "en", "story")).toBeUndefined();
  });
});
