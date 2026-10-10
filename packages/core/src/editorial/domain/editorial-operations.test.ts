import { describe, expect, it } from "vitest";

import {
  canEditorSetNewsletterStatus,
  newsletterEditorActions,
  newsletterStatuses,
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
