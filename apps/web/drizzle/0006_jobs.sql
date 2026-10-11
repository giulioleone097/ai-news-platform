-- One row per background job: the lease that lets one Worker request at a time run it, and when it last started.
CREATE TABLE job_leases (
  name TEXT PRIMARY KEY NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  leased_until TEXT NOT NULL,
  last_started_at TEXT NOT NULL
);
