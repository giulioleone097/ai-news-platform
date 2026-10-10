-- Schedule for the background workers in apps/jobs, owned by the database so it works on hosts
-- without cron (ChatGPT Sites) and without a Vercel dependency.
--
-- pg_cron fires private.dispatch_jobs() every minute; the function reads the jobs base URL and the
-- bearer secret from Supabase Vault and asks pg_net to POST each worker endpoint. Nothing is
-- hard-coded: each environment stores its own values after this migration runs
-- (docs/DEPLOYMENT.md, "Schedule the workers"). Until both Vault secrets exist the function does
-- nothing, so the migration is safe to apply before the jobs service is deployed.
--
--   vault secret `jobs_base_url`    origin of apps/jobs, e.g. https://jobs.example.com (no path)
--   vault secret `jobs_cron_secret` the same value as CRON_SECRET in the apps/jobs environment
--
-- The workers lease their rows (FOR UPDATE SKIP LOCKED) and mcp_event_deliveries is unique per
-- (subscription, article), so a duplicate or overlapping trigger does no extra work.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.dispatch_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  cron_secret text;
  endpoint text;
  dispatched integer := 0;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'jobs_base_url';
  select decrypted_secret into cron_secret from vault.decrypted_secrets where name = 'jobs_cron_secret';
  base_url := regexp_replace(btrim(coalesce(base_url, '')), '/+$', '');
  cron_secret := btrim(coalesce(cron_secret, ''));

  if base_url !~ '^https?://[^/]+$' or cron_secret = '' then
    return 0;
  end if;

  foreach endpoint in array array[
    '/internal/social-outbox',
    '/internal/newsletter-outbox',
    '/internal/comment-notifications',
    '/internal/mcp-events'
  ] loop
    perform net.http_post(
      url := base_url || endpoint,
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || cron_secret
      ),
      -- Workers finish within 60 seconds; the next minute's trigger may overlap and is safe.
      timeout_milliseconds := 55000
    );
    dispatched := dispatched + 1;
  end loop;

  return dispatched;
end;
$$;

revoke all on function private.dispatch_jobs() from public, anon, authenticated;

-- Same job names overwrite on re-run, so this migration is idempotent.
select cron.schedule('atlasnews-jobs-dispatch', '* * * * *', 'select private.dispatch_jobs()');

-- cron.job_run_details is never pruned by pg_cron itself.
select cron.schedule(
  'atlasnews-job-run-details-cleanup',
  '17 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
