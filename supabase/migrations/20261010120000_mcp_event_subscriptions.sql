-- MCP Events (webhook mode): subscriptions created through events/subscribe and an
-- outbox of signed webhook deliveries. Service-role only; no client-facing policies.

create table if not exists public.mcp_event_subscriptions (
  id text primary key check (id ~ '^sub_[0-9a-f]{64}$'),
  principal text not null check (char_length(principal) between 1 and 80),
  event_name text not null check (event_name in ('article.published')),
  arguments jsonb not null default '{}'::jsonb
    check (jsonb_typeof(arguments) = 'object' and octet_length(arguments::text) <= 1024),
  callback_url text not null
    check (char_length(callback_url) <= 2048 and callback_url ~ '^https://'),
  callback_host text not null check (char_length(callback_host) between 1 and 255),
  secret text not null check (secret ~ '^whsec_' and char_length(secret) <= 128),
  previous_secret text check (previous_secret ~ '^whsec_' and char_length(previous_secret) <= 128),
  previous_secret_expires_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'unsubscribed', 'gone')),
  expires_at timestamptz not null,
  verified_at timestamptz not null,
  checkpoint timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mcp_event_subscriptions_rotation_check check (
    (previous_secret is null) = (previous_secret_expires_at is null)
  )
);

create index if not exists mcp_event_subscriptions_host_idx
  on public.mcp_event_subscriptions (callback_host)
  where status = 'active';

create index if not exists mcp_event_subscriptions_live_idx
  on public.mcp_event_subscriptions (status, expires_at);

create index if not exists mcp_event_subscriptions_verification_idx
  on public.mcp_event_subscriptions (principal, callback_url, verified_at desc);

create table if not exists public.mcp_event_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id text not null
    references public.mcp_event_subscriptions(id) on delete cascade,
  article_id text not null check (char_length(article_id) between 1 and 128),
  event_id text not null check (event_id ~ '^evt_[0-9a-f]{64}$'),
  event jsonb not null
    check (jsonb_typeof(event) = 'object' and octet_length(event::text) <= 262144),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'delivered', 'failed', 'cancelled')),
  attempts smallint not null default 0 check (attempts between 0 and 100),
  max_attempts smallint not null default 8 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_code text check (char_length(last_error_code) <= 80),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mcp_event_deliveries_one_per_article unique (subscription_id, article_id),
  constraint mcp_event_deliveries_lease_state_check check (
    (status = 'processing' and lease_token is not null and lease_expires_at is not null)
    or (status <> 'processing' and lease_token is null and lease_expires_at is null)
  )
);

create index if not exists mcp_event_deliveries_pending_idx
  on public.mcp_event_deliveries (available_at, created_at, id)
  where status = 'pending';

create index if not exists mcp_event_deliveries_processing_lease_idx
  on public.mcp_event_deliveries (lease_expires_at, id)
  where status = 'processing';

create index if not exists mcp_event_deliveries_finished_idx
  on public.mcp_event_deliveries (updated_at)
  where status in ('delivered', 'failed', 'cancelled');

drop trigger if exists mcp_event_subscriptions_set_updated_at on public.mcp_event_subscriptions;
create trigger mcp_event_subscriptions_set_updated_at
before update on public.mcp_event_subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists mcp_event_deliveries_set_updated_at on public.mcp_event_deliveries;
create trigger mcp_event_deliveries_set_updated_at
before update on public.mcp_event_deliveries
for each row execute function public.set_updated_at();

alter table public.mcp_event_subscriptions enable row level security;
alter table public.mcp_event_subscriptions force row level security;
alter table public.mcp_event_deliveries enable row level security;
alter table public.mcp_event_deliveries force row level security;
revoke all on table public.mcp_event_subscriptions from public, anon, authenticated;
revoke all on table public.mcp_event_deliveries from public, anon, authenticated;

create or replace function public.claim_mcp_event_deliveries(
  p_worker_token uuid,
  p_limit integer default 20,
  p_lease_seconds integer default 90
)
returns setof public.mcp_event_deliveries
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit not between 1 and 50 or p_lease_seconds not between 30 and 300 then
    raise exception 'Invalid claim bounds' using errcode = '22023';
  end if;

  update public.mcp_event_deliveries set
    status = 'failed',
    lease_token = null,
    lease_expires_at = null,
    last_error_code = 'lease_expired_max_attempts'
  where status = 'processing'
    and lease_expires_at <= now()
    and attempts >= max_attempts;

  return query
  with candidates as (
    select delivery.id
    from public.mcp_event_deliveries delivery
    join public.mcp_event_subscriptions subscription
      on subscription.id = delivery.subscription_id
    where subscription.status = 'active'
      and subscription.expires_at > now()
      and delivery.attempts < delivery.max_attempts
      and (
        (delivery.status = 'pending' and delivery.available_at <= now())
        or (delivery.status = 'processing' and delivery.lease_expires_at <= now())
      )
    order by delivery.available_at, delivery.created_at, delivery.id
    limit p_limit
    for update of delivery skip locked
  )
  update public.mcp_event_deliveries delivery set
    status = 'processing',
    attempts = delivery.attempts + 1,
    lease_token = p_worker_token,
    lease_expires_at = now() + make_interval(secs => p_lease_seconds)
  from candidates
  where delivery.id = candidates.id
  returning delivery.*;
end;
$$;

revoke all on function public.claim_mcp_event_deliveries(uuid, integer, integer) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on table public.mcp_event_subscriptions to service_role;
    grant select, insert, update, delete on table public.mcp_event_deliveries to service_role;
    grant execute on function public.claim_mcp_event_deliveries(uuid, integer, integer) to service_role;
  end if;
end;
$$;
