import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimJobRun, releaseJobRun } from "./jobs";
import { createSitesTestStore, type SitesTestStore } from "./testing";

describe("Sites job lease", () => {
  let store: SitesTestStore;
  beforeAll(async () => {
    store = await createSitesTestStore();
  });
  afterAll(() => store.dispose());

  it("lets one run start per interval and lease", async () => {
    const options = { intervalMs: 60_000, leaseMs: 30_000 };
    const start = new Date("2026-10-11T10:00:00.000Z");
    const at = (ms: number) => new Date(start.getTime() + ms);

    const claims = await Promise.all([1, 2, 3].map(() => claimJobRun(store.database, "outbox", { ...options, now: start })));
    expect(claims.filter(Boolean)).toHaveLength(1);

    await releaseJobRun(store.database, "outbox", at(5_000));
    expect(await claimJobRun(store.database, "outbox", { ...options, now: at(10_000) })).toBe(false);
    expect(await claimJobRun(store.database, "outbox", { ...options, now: at(60_000) })).toBe(true);
    // Still leased by that run, although the interval has passed again.
    expect(await claimJobRun(store.database, "outbox", { ...options, now: at(80_000) })).toBe(false);
    expect(await claimJobRun(store.database, "other", { ...options, now: at(80_000) })).toBe(true);
  });
});
