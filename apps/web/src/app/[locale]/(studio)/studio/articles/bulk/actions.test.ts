import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/capabilities", () => ({ runEditorCapability: mocks.run }));

import { batchLimit } from "@atlasnews/core/editorial/domain/errors";
import {
  deleteArticlesAction,
  publishArticlesAction,
  unpublishArticlesAction,
} from "./actions";

const ids = ["8a1f0c2e-1111-4a6b-9c3d-000000000001", "8a1f0c2e-1111-4a6b-9c3d-000000000002"];

function idsOf(count: number) {
  return Array.from({ length: count }, (_, index) => `article-${index}`);
}

describe("bulk article actions", () => {
  beforeEach(() => {
    mocks.run.mockReset().mockResolvedValue({ ok: true, result: { count: ids.length, items: [] } });
    mocks.revalidatePath.mockReset();
  });

  it.each([
    ["publish", publishArticlesAction, "admin_publish_articles", "Published 2 articles."],
    ["unpublish", unpublishArticlesAction, "admin_unpublish_articles", "Unpublished 2 articles."],
    ["delete", deleteArticlesAction, "admin_delete_articles", "Deleted 2 articles."],
  ])("sends the selected ids to the %s capability with confirmed set", async (_name, action, capability, message) => {
    const result = await action("en", ids);

    expect(mocks.run).toHaveBeenCalledOnce();
    expect(mocks.run).toHaveBeenCalledWith(
      capability,
      { items: ids.map((id) => ({ id, locale: "en" })) },
      { confirmed: true },
    );
    expect(result).toEqual({ status: "success", message });
    expect(mocks.revalidatePath.mock.calls).toEqual([["/en/studio"], ["/en/studio/articles"]]);
  });

  it("shows the capability's refusal and changes nothing", async () => {
    const refusal = "Nothing was written. 1 item is invalid. #0 (a): the article is already published";
    mocks.run.mockResolvedValue({ ok: false, status: 400, error: refusal });

    const result = await publishArticlesAction("it", ids);

    expect(result).toEqual({ status: "error", message: refusal });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a failure instead of throwing when the runner fails", async () => {
    mocks.run.mockRejectedValue(new Error("database unavailable"));

    const result = await deleteArticlesAction("en", ids);

    expect(result).toEqual({
      status: "error",
      message: "The selected articles could not be updated. Try again.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects more than the batch limit before calling the runner", async () => {
    const result = await unpublishArticlesAction("en", idsOf(batchLimit + 1));

    expect(result).toEqual({ status: "error", message: `Select at most ${batchLimit} articles at a time.` });
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("rejects an empty selection before calling the runner", async () => {
    const result = await publishArticlesAction("en", []);

    expect(result).toEqual({ status: "error", message: "Select at least one article." });
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("rejects an unknown locale before calling the runner", async () => {
    const result = await deleteArticlesAction("de" as "en", ids);

    expect(result.status).toBe("error");
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
