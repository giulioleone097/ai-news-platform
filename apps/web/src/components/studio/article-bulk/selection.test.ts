import { batchLimit } from "@atlasnews/core/editorial/domain/errors";
import { describe, expect, it } from "vitest";
import {
  exceedsBatchLimit,
  pageSelectionState,
  selectedOnPage,
  setPageSelection,
  toggleArticle,
} from "./selection";

const page = ["a", "b", "c"];

describe("article selection", () => {
  it("selects every article on the page and keeps the selection made on other pages", () => {
    const selected = setPageSelection(new Set(["elsewhere"]), page, true);

    expect([...selected]).toEqual(["elsewhere", "a", "b", "c"]);
    expect(pageSelectionState(selectedOnPage(selected, page).length, page.length)).toBe("all");
  });

  it("clears only the articles on the page when deselecting all", () => {
    const selected = setPageSelection(new Set(["elsewhere", "a", "b"]), page, false);

    expect([...selected]).toEqual(["elsewhere"]);
    expect(selectedOnPage(selected, page)).toEqual([]);
  });

  it("toggles one article and reports a partial selection", () => {
    const added = toggleArticle(new Set(), "b");
    expect(selectedOnPage(added, page)).toEqual(["b"]);
    expect(pageSelectionState(1, page.length)).toBe("some");

    expect([...toggleArticle(added, "b")]).toEqual([]);
  });

  it("returns selected ids in page order and ignores ids that left the page", () => {
    expect(selectedOnPage(new Set(["c", "gone", "a"]), page)).toEqual(["a", "c"]);
  });

  it("flags a selection above the core batch limit and accepts one at the limit", () => {
    expect(exceedsBatchLimit(batchLimit, batchLimit)).toBe(false);
    expect(exceedsBatchLimit(batchLimit + 1, batchLimit)).toBe(true);
  });
});
