const navigationTimeoutMs = 10_000;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `push` is the app router's client-side navigation, so the agent's tools survive it. The returned function
 * moves the visible page and resolves `true` once the address bar shows `path`.
 */
export function createNavigator(push: (path: string) => void) {
  return async function navigate(path: string): Promise<boolean> {
    const target = new URL(path, location.origin);
    if (target.origin !== location.origin) return false;
    const here = () => location.pathname + location.search;
    const wanted = target.pathname + target.search;
    if (here() !== wanted) {
      push(wanted);
      const deadline = Date.now() + navigationTimeoutMs;
      while (here() !== wanted) {
        if (Date.now() > deadline) return false;
        await sleep(50);
      }
    }
    // Let React finish painting the page the address bar already shows.
    await sleep(0);
    return true;
  };
}
