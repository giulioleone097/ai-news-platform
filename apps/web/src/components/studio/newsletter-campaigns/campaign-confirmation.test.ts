import { describe, expect, it } from "vitest";
import { parseNewsletterCampaignRequest } from "./campaign-confirmation";

function request(intent: string, confirmation?: string) {
  const formData = new FormData();
  formData.set("intent", intent);
  if (confirmation) formData.set("confirmation", confirmation);
  return parseNewsletterCampaignRequest(formData);
}

describe("newsletter campaign mutation confirmation", () => {
  it("allows draft saves without an external side effect confirmation", () => {
    expect(request("save").success).toBe(true);
  });

  it.each(["schedule", "send", "cancel"])("requires matching confirmation for %s", (intent) => {
    expect(request(intent).success).toBe(false);
    expect(request(intent, "send").success).toBe(intent === "send");
    expect(request(intent, intent).success).toBe(true);
  });
});
