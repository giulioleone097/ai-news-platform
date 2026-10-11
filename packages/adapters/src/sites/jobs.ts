import type { D1Database } from "./cloudflare";

/**
 * Sites has no cron and no background service, so the Worker runs due jobs itself in the background of
 * ordinary requests (`ctx.waitUntil`). This lease keeps that to one run per job and interval across all
 * isolates: the run that wins the upsert below owns the job until `leased_until`.
 */
export interface JobLeaseOptions {
  /** Least time between two starts of the job. */
  intervalMs: number;
  /** How long a started run may take before another request may start it again. */
  leaseMs: number;
  now?: Date;
}

/** True when this caller may run `name` now; the lease is then held for `leaseMs`. */
export async function claimJobRun(database: D1Database, name: string, options: JobLeaseOptions) {
  const now = options.now ?? new Date();
  const startedAt = now.toISOString();
  const leasedUntil = new Date(now.getTime() + options.leaseMs).toISOString();
  const startedBefore = new Date(now.getTime() - options.intervalMs).toISOString();
  const claimed = await database.prepare(
    `INSERT INTO job_leases (name, leased_until, last_started_at) VALUES (?, ?, ?)
     ON CONFLICT (name) DO UPDATE SET leased_until = excluded.leased_until, last_started_at = excluded.last_started_at
     WHERE job_leases.leased_until <= ? AND job_leases.last_started_at <= ?
     RETURNING name`,
  ).bind(name, leasedUntil, startedAt, startedAt, startedBefore).first();
  return Boolean(claimed);
}

/** Ends a run early so the next interval does not wait for the lease to expire. */
export async function releaseJobRun(database: D1Database, name: string, now = new Date()) {
  await database.prepare("UPDATE job_leases SET leased_until = ? WHERE name = ?").bind(now.toISOString(), name).run();
}
