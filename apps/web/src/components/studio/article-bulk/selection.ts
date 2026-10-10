/** The selected ids that are on this page, in page order; ids that left the page are ignored. */
export function selectedOnPage(selected: ReadonlySet<string>, pageIds: readonly string[]): string[] {
  return pageIds.filter((id) => selected.has(id));
}

export function toggleArticle(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Selects or clears every article on the page and keeps the selection made on other pages. */
export function setPageSelection(
  selected: ReadonlySet<string>,
  pageIds: readonly string[],
  checked: boolean,
): Set<string> {
  const next = new Set(selected);
  for (const id of pageIds) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}

export function pageSelectionState(selectedCount: number, pageSize: number): "none" | "some" | "all" {
  if (selectedCount === 0) return "none";
  return selectedCount >= pageSize ? "all" : "some";
}

export function exceedsBatchLimit(count: number, limit: number): boolean {
  return count > limit;
}
