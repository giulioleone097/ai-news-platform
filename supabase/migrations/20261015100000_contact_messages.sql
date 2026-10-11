-- Messages from the public contact form (/support) and the rate-limit buckets that guard it.
--
-- Only the app's service role reads or changes them. Visitors insert through submit_contact_message(), a
-- SECURITY DEFINER function that the service role alone may execute (as the newsletter request path does):
-- anon and authenticated have no table privilege, no policy and no function grant, so nobody can read the
-- inbox or write a row around the rate limits. The Studio and the MCP tools reach the table with the
-- service-role key after they have checked that an editor is signed in.

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  locale text not null check (locale in ('en', 'it')),
  name text not null check (char_length(name) between 2 and 100),
  email text not null check (
    email = lower(btrim(email))
    and char_length(email) <= 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  subject text not null check (char_length(subject) between 3 and 150),
  body text not null check (char_length(body) between 10 and 4000),
  status text not null default 'new' check (status in ('new', 'handled', 'archived')),
  -- Milliseconds, like the app's ISO timestamps, so the keyset cursor of the inbox compares exactly.
  created_at timestamptz not null default date_trunc('milliseconds', now())
);

create index if not exists contact_messages_created_idx
  on public.contact_messages (created_at desc, id desc);
create index if not exists contact_messages_status_created_idx
  on public.contact_messages (status, created_at desc, id desc);

create table if not exists public.contact_request_limits (
  scope_key text primary key
    check (scope_key = 'global' or scope_key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists contact_request_limits_updated_idx
  on public.contact_request_limits (updated_at);

create or replace function public.submit_contact_message(
  p_id uuid,
  p_locale text,
  p_name text,
  p_email text,
  p_subject text,
  p_body text,
  p_request_fingerprint text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_count integer;
  global_count integer;
  -- Ten minutes per requester, one hour for the whole site (core: contactPolicy).
  requester_window timestamptz := date_bin(
    interval '10 minutes',
    statement_timestamp(),
    timestamptz '2000-01-01 00:00:00+00'
  );
  global_window timestamptz := date_trunc('hour', statement_timestamp());
begin
  if coalesce((select auth.role()) = 'service_role', false) is false then
    raise exception 'Contact message access denied' using errcode = '42501';
  end if;
  if p_request_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid contact request fingerprint' using errcode = '22023';
  end if;

  -- Buckets idle for a day are gone; the counters never outlive their usefulness.
  delete from public.contact_request_limits as stale_limit
  where stale_limit.scope_key in (
    select expired_limit.scope_key
    from public.contact_request_limits as expired_limit
    where expired_limit.scope_key <> 'global'
      and expired_limit.updated_at < statement_timestamp() - interval '1 day'
    order by expired_limit.updated_at
    limit 16
  );

  insert into public.contact_request_limits (scope_key, window_started_at, request_count, updated_at)
  values (p_request_fingerprint, requester_window, 1, statement_timestamp())
  on conflict (scope_key) do update set
    window_started_at = excluded.window_started_at,
    request_count = case
      when public.contact_request_limits.window_started_at = excluded.window_started_at
        then public.contact_request_limits.request_count + 1
      else 1
    end,
    updated_at = statement_timestamp()
  returning request_count into requester_count;

  if requester_count > 5 then
    return 'rate_limited';
  end if;

  insert into public.contact_request_limits (scope_key, window_started_at, request_count, updated_at)
  values ('global', global_window, 1, statement_timestamp())
  on conflict (scope_key) do update set
    window_started_at = excluded.window_started_at,
    request_count = case
      when public.contact_request_limits.window_started_at = excluded.window_started_at
        then public.contact_request_limits.request_count + 1
      else 1
    end,
    updated_at = statement_timestamp()
  returning request_count into global_count;

  if global_count > 100 then
    return 'rate_limited';
  end if;

  insert into public.contact_messages (id, locale, name, email, subject, body, created_at)
  values (
    p_id,
    p_locale,
    btrim(p_name),
    lower(btrim(p_email)),
    btrim(p_subject),
    btrim(p_body),
    date_trunc('milliseconds', statement_timestamp())
  );

  return 'created';
end;
$$;

revoke all on function public.submit_contact_message(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;

alter table public.contact_messages enable row level security;
alter table public.contact_messages force row level security;
alter table public.contact_request_limits enable row level security;
alter table public.contact_request_limits force row level security;

drop policy if exists contact_messages_service_only on public.contact_messages;
create policy contact_messages_service_only on public.contact_messages
  for all to public
  using (coalesce((select auth.role()) = 'service_role', false))
  with check (coalesce((select auth.role()) = 'service_role', false));

drop policy if exists contact_request_limits_service_only on public.contact_request_limits;
create policy contact_request_limits_service_only on public.contact_request_limits
  for all to public
  using (coalesce((select auth.role()) = 'service_role', false))
  with check (coalesce((select auth.role()) = 'service_role', false));

revoke all on public.contact_messages, public.contact_request_limits from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.submit_contact_message(uuid, text, text, text, text, text, text) to service_role';
    execute 'grant select, update, delete on public.contact_messages to service_role';
  end if;
end;
$$;
