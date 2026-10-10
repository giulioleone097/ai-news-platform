/** The browser-local bookmark store: a JSON array of story ids in `localStorage`. */
const storageKey = "atlasnews:saved";
const changeEvent = "atlasnews:saved";

export function subscribeBookmarks(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(changeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(changeEvent, onChange);
  };
}

/** The raw stored string, a stable snapshot for `useSyncExternalStore`. */
export const readBookmarksSnapshot = () => localStorage.getItem(storageKey) || "[]";

export function parseBookmarks(snapshot: string): string[] {
  try {
    const parsed: unknown = JSON.parse(snapshot);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function saveBookmarks(ids: string[]) {
  localStorage.setItem(storageKey, JSON.stringify(ids));
  window.dispatchEvent(new Event(changeEvent));
}
