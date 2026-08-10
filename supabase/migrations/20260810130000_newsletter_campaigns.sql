alter table public.newsletter_subscriptions
  add column if not exists confirmation_token_hash text,
  add column if not exists confirmation_expires_at timestamptz,
  add column if not exists confirmation_sent_at timestamptz,
  add column if not exists confirmation_claimed_at timestamptz,
  add column if not exists confirmation_provider_message_id text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists suppressed_at timestamptz,
  add column if not exists suppression_reason text;

alter table public.newsletter_subscriptions
  drop constraint if exists newsletter_subscriptions_status_check;
alter table public.newsletter_subscriptions
  add constraint newsletter_subscriptions_status_check
  check (status in ('pending', 'active', 'unsubscribed', 'suppressed'));

update public.newsletter_subscriptions
set confirmed_at = coalesce(confirmed_at, consented_at)
where status = 'active' and confirmed_at is null;

alter table public.newsletter_subscriptions
  drop constraint if exists newsletter_subscriptions_active_confirmation_check;
alter table public.newsletter_subscriptions
  add constraint newsletter_subscriptions_active_confirmation_check
  check (status <> 'active' or confirmed_at is not null);

create table if not exists public.newsletter_suppressions (
  id bigint generated always as identity primary key,
  email_hash text not null unique check (email_hash ~ '^[a-f0-9]{64}$'),
  reason text not null check (reason in ('bounce', 'complaint', 'erasure')),
  created_at timestamptz not null default now()
);

create table if not exists public.newsletter_subscription_request_limits (
  scope_key text primary key
    check (scope_key = 'global' or scope_key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists newsletter_subscription_request_limits_updated_idx
  on public.newsletter_subscription_request_limits (updated_at);

create index if not exists newsletter_subscriptions_confirmation_idx
  on public.newsletter_subscriptions (confirmation_expires_at, id)
  where status = 'pending';

create table if not exists public.newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),
  locale text not null check (locale in ('en', 'it')),
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  subject text not null check (char_length(subject) between 1 and 200),
  preheader text not null default '' check (char_length(preheader) <= 300),
  from_name text not null check (char_length(from_name) between 1 and 120),
  from_email text not null,
  reply_to text,
  content_markdown text not null default '' check (char_length(content_markdown) <= 200000),
  content_html text not null default '' check (char_length(content_html) <= 500000),
  audience_locale text not null check (audience_locale in ('en', 'it')),
  audience_status text not null default 'active' check (audience_status = 'active'),
  scheduled_for timestamptz,
  started_at timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  delivered_count integer not null default 0 check (delivered_count >= 0),
  bounce_count integer not null default 0 check (bounce_count >= 0),
  complaint_count integer not null default 0 check (complaint_count >= 0),
  open_count integer not null default 0 check (open_count >= 0),
  click_count integer not null default 0 check (click_count >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsletter_campaign_from_email_shape check (
    from_email = lower(trim(from_email))
    and from_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint newsletter_campaign_reply_to_shape check (
    reply_to is null or (
      reply_to = lower(trim(reply_to))
      and reply_to ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  constraint newsletter_campaign_schedule_state check (
    (status = 'scheduled' and scheduled_for is not null)
    or status <> 'scheduled'
  )
);

create table if not exists public.newsletter_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.newsletter_campaigns(id) on delete cascade,
  subscription_id uuid references public.newsletter_subscriptions(id) on delete set null,
  email text not null,
  locale text not null check (locale in ('en', 'it')),
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'cancelled')),
  provider_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsletter_recipient_email_shape check (
    email = lower(trim(email))
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint newsletter_recipient_campaign_subscription_key unique (campaign_id, subscription_id),
  constraint newsletter_recipient_campaign_email_key unique (campaign_id, email),
  constraint newsletter_recipient_provider_message_key unique (provider_message_id)
);

create table if not exists public.newsletter_outbox (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.newsletter_campaigns(id) on delete cascade,
  recipient_id uuid not null references public.newsletter_campaign_recipients(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'sent', 'dead', 'cancelled')),
  attempts smallint not null default 0 check (attempts between 0 and 20),
  max_attempts smallint not null default 5 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  worker_id text,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 256),
  provider_message_id text,
  last_error text,
  dispatch_started_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsletter_outbox_recipient_key unique (recipient_id),
  constraint newsletter_outbox_idempotency_key unique (idempotency_key),
  constraint newsletter_outbox_provider_message_key unique (provider_message_id)
);

create table if not exists public.newsletter_delivery_events (
  id bigint generated always as identity primary key,
  webhook_id text not null unique check (char_length(webhook_id) between 1 and 255),
  provider_message_id text not null check (char_length(provider_message_id) between 1 and 255),
  event_type text not null check (char_length(event_type) between 1 and 100),
  event_at timestamptz not null,
  campaign_id uuid references public.newsletter_campaigns(id) on delete set null,
  recipient_id uuid references public.newsletter_campaign_recipients(id) on delete set null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists newsletter_campaigns_locale_created_idx
  on public.newsletter_campaigns (locale, created_at desc, id desc);
create index if not exists newsletter_campaigns_scheduled_idx
  on public.newsletter_campaigns (scheduled_for, id)
  where status = 'scheduled';
create index if not exists newsletter_campaigns_created_by_idx
  on public.newsletter_campaigns (created_by);
create index if not exists newsletter_recipients_campaign_status_idx
  on public.newsletter_campaign_recipients (campaign_id, delivery_status, id);
create index if not exists newsletter_recipients_subscription_idx
  on public.newsletter_campaign_recipients (subscription_id);
create index if not exists newsletter_outbox_campaign_idx
  on public.newsletter_outbox (campaign_id);
create index if not exists newsletter_outbox_ready_idx
  on public.newsletter_outbox (available_at, id)
  where status in ('pending', 'retry', 'processing');
create index if not exists newsletter_events_provider_idx
  on public.newsletter_delivery_events (provider_message_id, event_at, id);
create index if not exists newsletter_events_campaign_idx
  on public.newsletter_delivery_events (campaign_id, event_at desc, id desc);
create index if not exists newsletter_events_recipient_idx
  on public.newsletter_delivery_events (recipient_id, event_at, id);

drop trigger if exists newsletter_campaigns_set_updated_at on public.newsletter_campaigns;
create trigger newsletter_campaigns_set_updated_at
before update on public.newsletter_campaigns
for each row execute function public.set_updated_at();

drop trigger if exists newsletter_recipients_set_updated_at on public.newsletter_campaign_recipients;
create trigger newsletter_recipients_set_updated_at
before update on public.newsletter_campaign_recipients
for each row execute function public.set_updated_at();

drop trigger if exists newsletter_outbox_set_updated_at on public.newsletter_outbox;
create trigger newsletter_outbox_set_updated_at
before update on public.newsletter_outbox
for each row execute function public.set_updated_at();

create or replace function public.newsletter_request_is_editor_or_service()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.role()) = 'service_role', false)
    or (select public.is_editor());
$$;

revoke all on function public.newsletter_request_is_editor_or_service() from public;

create or replace function public.request_newsletter_subscription(
  p_email text,
  p_source text,
  p_locale text,
  p_token_hash text,
  p_email_hash text,
  p_request_fingerprint text,
  p_expires_at timestamptz
)
returns table (subscription_id uuid, subscription_status text, should_send boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(p_email));
  normalized_source text := trim(p_source);
  subscription public.newsletter_subscriptions%rowtype;
  requester_count integer;
  global_count integer;
  requester_window timestamptz := date_bin(
    interval '10 minutes',
    statement_timestamp(),
    timestamptz '2000-01-01 00:00:00+00'
  );
  global_window timestamptz := date_trunc('minute', statement_timestamp());
begin
  if coalesce((select auth.role()) = 'service_role', false) is false then
    raise exception 'Newsletter subscription access denied' using errcode = '42501';
  end if;
  if char_length(normalized_email) > 254
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'Invalid newsletter email' using errcode = '22023';
  end if;
  if normalized_source !~ '^[a-z0-9:_-]{2,80}$' then
    raise exception 'Invalid newsletter source' using errcode = '22023';
  end if;
  if p_locale not in ('en', 'it') then
    raise exception 'Invalid newsletter locale' using errcode = '22023';
  end if;
  if p_token_hash !~ '^[a-f0-9]{64}$'
    or p_email_hash !~ '^[a-f0-9]{64}$'
    or p_request_fingerprint !~ '^[a-f0-9]{64}$'
  then
    raise exception 'Invalid newsletter token' using errcode = '22023';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '48 hours' then
    raise exception 'Invalid newsletter confirmation expiry' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_email, 0)
  );

  if exists (select 1 from public.newsletter_suppressions where email_hash = p_email_hash) then
    return query select null::uuid, 'suppressed'::text, false;
    return;
  end if;

  select * into subscription
  from public.newsletter_subscriptions
  where email = normalized_email
  for update;

  if found and subscription.status in ('active', 'suppressed') then
    return query select subscription.id, subscription.status, false;
    return;
  end if;

  if found and subscription.status = 'pending'
    and (
      subscription.confirmation_claimed_at > now() - interval '5 minutes'
      or subscription.confirmation_sent_at > now() - interval '5 minutes'
    )
  then
    return query select subscription.id, subscription.status, false;
    return;
  end if;

  delete from public.newsletter_subscription_request_limits as stale_limit
  where stale_limit.scope_key in (
    select expired_limit.scope_key
    from public.newsletter_subscription_request_limits as expired_limit
    where expired_limit.scope_key <> 'global'
      and expired_limit.updated_at < statement_timestamp() - interval '30 days'
    order by expired_limit.updated_at
    limit 16
  );

  insert into public.newsletter_subscription_request_limits (
    scope_key,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_request_fingerprint,
    requester_window,
    1,
    statement_timestamp()
  )
  on conflict (scope_key) do update set
    window_started_at = excluded.window_started_at,
    request_count = case
      when public.newsletter_subscription_request_limits.window_started_at = excluded.window_started_at
        then public.newsletter_subscription_request_limits.request_count + 1
      else 1
    end,
    updated_at = statement_timestamp()
  returning request_count into requester_count;

  if requester_count > 10 then
    return query select subscription.id, 'rate_limited'::text, false;
    return;
  end if;

  insert into public.newsletter_subscription_request_limits (
    scope_key,
    window_started_at,
    request_count,
    updated_at
  ) values (
    'global',
    global_window,
    1,
    statement_timestamp()
  )
  on conflict (scope_key) do update set
    window_started_at = excluded.window_started_at,
    request_count = case
      when public.newsletter_subscription_request_limits.window_started_at = excluded.window_started_at
        then public.newsletter_subscription_request_limits.request_count + 1
      else 1
    end,
    updated_at = statement_timestamp()
  returning request_count into global_count;

  if global_count > 200 then
    return query select subscription.id, 'rate_limited'::text, false;
    return;
  end if;

  if subscription.id is not null then
    update public.newsletter_subscriptions set
      source = normalized_source,
      locale = p_locale,
      status = 'pending',
      consented_at = now(),
      unsubscribed_at = null,
      confirmed_at = null,
      confirmation_token_hash = p_token_hash,
      confirmation_expires_at = p_expires_at,
      confirmation_claimed_at = now(),
      confirmation_sent_at = null,
      confirmation_provider_message_id = null,
      suppressed_at = null,
      suppression_reason = null
    where id = subscription.id
    returning * into subscription;
  else
    insert into public.newsletter_subscriptions (
      email,
      source,
      locale,
      status,
      consented_at,
      confirmation_token_hash,
      confirmation_expires_at,
      confirmation_claimed_at
    ) values (
      normalized_email,
      normalized_source,
      p_locale,
      'pending',
      now(),
      p_token_hash,
      p_expires_at,
      now()
    )
    returning * into subscription;
  end if;

  return query select subscription.id, subscription.status, true;
end;
$$;

revoke all on function public.request_newsletter_subscription(text, text, text, text, text, text, timestamptz) from public;

create or replace function public.complete_newsletter_confirmation(
  p_subscription_id uuid,
  p_token_hash text,
  p_provider_message_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()) = 'service_role', false) is false then
    raise exception 'Newsletter confirmation access denied' using errcode = '42501';
  end if;
  update public.newsletter_subscriptions set
    confirmation_sent_at = now(),
    confirmation_provider_message_id = p_provider_message_id,
    confirmation_claimed_at = null
  where id = p_subscription_id
    and status = 'pending'
    and confirmation_token_hash = p_token_hash;
  return found;
end;
$$;

revoke all on function public.complete_newsletter_confirmation(uuid, text, text) from public;

create or replace function public.release_newsletter_confirmation(
  p_subscription_id uuid,
  p_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()) = 'service_role', false) is false then
    raise exception 'Newsletter confirmation access denied' using errcode = '42501';
  end if;
  update public.newsletter_subscriptions set confirmation_claimed_at = null
  where id = p_subscription_id
    and status = 'pending'
    and confirmation_token_hash = p_token_hash
    and confirmation_sent_at is null;
  return found;
end;
$$;

revoke all on function public.release_newsletter_confirmation(uuid, text) from public;

create or replace function public.confirm_newsletter_subscription(
  p_subscription_id uuid,
  p_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  subscription public.newsletter_subscriptions%rowtype;
begin
  if coalesce((select auth.role()) = 'service_role', false) is false then
    raise exception 'Newsletter confirmation access denied' using errcode = '42501';
  end if;

  select * into subscription
  from public.newsletter_subscriptions
  where id = p_subscription_id
  for update;

  if not found then return false; end if;
  if subscription.status <> 'pending'
    or subscription.confirmation_token_hash is distinct from p_token_hash
    or subscription.confirmation_expires_at <= now()
  then
    return false;
  end if;

  update public.newsletter_subscriptions set
    status = 'active',
    confirmed_at = now(),
    confirmation_token_hash = null,
    confirmation_expires_at = null,
    confirmation_claimed_at = null
  where id = subscription.id;
  return true;
end;
$$;

revoke all on function public.confirm_newsletter_subscription(uuid, text) from public;

create or replace function public.subscribe_newsletter(
  p_email text,
  p_source text,
  p_locale text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Newsletter subscription requires double opt-in'
    using errcode = '42501';
end;
$$;

revoke all on function public.subscribe_newsletter(text, text, text) from public, anon, authenticated;

create or replace function public.refresh_newsletter_campaign_metrics(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_count integer;
begin
  update public.newsletter_campaigns as campaign set
    recipient_count = metrics.recipient_count,
    sent_count = metrics.sent_count,
    delivered_count = metrics.delivered_count,
    bounce_count = metrics.bounce_count,
    complaint_count = metrics.complaint_count,
    failure_count = metrics.failure_count,
    open_count = coalesce(events.open_count, 0),
    click_count = coalesce(events.click_count, 0)
  from (
    select
      count(*)::integer as recipient_count,
      count(*) filter (where delivery_status in ('sent', 'delivered', 'bounced', 'complained'))::integer as sent_count,
      count(*) filter (where delivery_status = 'delivered')::integer as delivered_count,
      count(*) filter (where delivery_status = 'bounced')::integer as bounce_count,
      count(*) filter (where delivery_status = 'complained')::integer as complaint_count,
      count(*) filter (where delivery_status = 'failed')::integer as failure_count
    from public.newsletter_campaign_recipients
    where campaign_id = p_campaign_id
  ) as metrics
  left join lateral (
    select
      count(*) filter (where event_type = 'email.opened')::integer as open_count,
      count(*) filter (where event_type = 'email.clicked')::integer as click_count
    from public.newsletter_delivery_events
    where campaign_id = p_campaign_id
  ) as events on true
  where campaign.id = p_campaign_id;

  select count(*)::integer into pending_count
  from public.newsletter_outbox
  where campaign_id = p_campaign_id
    and status in ('pending', 'retry', 'processing');

  if pending_count = 0 then
    update public.newsletter_campaigns
    set status = 'sent', sent_at = coalesce(sent_at, now())
    where id = p_campaign_id and status in ('scheduled', 'sending');
  end if;
end;
$$;

revoke all on function public.refresh_newsletter_campaign_metrics(uuid) from public;

create or replace function public.queue_newsletter_campaign(
  p_campaign_id uuid,
  p_scheduled_for timestamptz default null
)
returns public.newsletter_campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign public.newsletter_campaigns%rowtype;
  snapshot_count integer;
begin
  if not (select public.newsletter_request_is_editor_or_service()) then
    raise exception 'Newsletter campaign access denied' using errcode = '42501';
  end if;

  select * into campaign
  from public.newsletter_campaigns
  where id = p_campaign_id
  for update;

  if not found then
    raise exception 'Newsletter campaign not found' using errcode = 'P0002';
  end if;

  if campaign.status in ('sending', 'sent') and p_scheduled_for is null then
    return campaign;
  end if;
  if campaign.status = 'scheduled' and p_scheduled_for is not null
    and campaign.scheduled_for = p_scheduled_for
  then
    return campaign;
  end if;
  if campaign.status <> 'draft' then
    raise exception 'Only draft campaigns can be queued' using errcode = '22023';
  end if;
  if char_length(trim(campaign.content_markdown)) < 20 then
    raise exception 'Campaign content is incomplete' using errcode = '22023';
  end if;
  if p_scheduled_for is not null and p_scheduled_for <= now() then
    raise exception 'Scheduled delivery must be in the future' using errcode = '22023';
  end if;

  insert into public.newsletter_campaign_recipients (
    campaign_id,
    subscription_id,
    email,
    locale
  )
  select
    campaign.id,
    subscription.id,
    subscription.email,
    subscription.locale
  from public.newsletter_subscriptions as subscription
  where subscription.locale = campaign.audience_locale
    and subscription.status = campaign.audience_status
  order by subscription.id
  on conflict (campaign_id, subscription_id) do nothing;

  select count(*)::integer into snapshot_count
  from public.newsletter_campaign_recipients
  where campaign_id = campaign.id;

  if snapshot_count = 0 then
    raise exception 'Campaign audience is empty' using errcode = '22023';
  end if;

  insert into public.newsletter_outbox (
    campaign_id,
    recipient_id,
    available_at,
    idempotency_key
  )
  select
    recipient.campaign_id,
    recipient.id,
    coalesce(p_scheduled_for, now()),
    'newsletter:' || recipient.campaign_id::text || ':' || recipient.id::text
  from public.newsletter_campaign_recipients as recipient
  where recipient.campaign_id = campaign.id
  order by recipient.id
  on conflict (recipient_id) do nothing;

  update public.newsletter_campaigns set
    status = case when p_scheduled_for is null then 'sending' else 'scheduled' end,
    scheduled_for = p_scheduled_for,
    started_at = case when p_scheduled_for is null then coalesce(started_at, now()) else null end,
    recipient_count = snapshot_count
  where id = campaign.id
  returning * into campaign;

  return campaign;
end;
$$;

revoke all on function public.queue_newsletter_campaign(uuid, timestamptz) from public;
grant execute on function public.queue_newsletter_campaign(uuid, timestamptz) to authenticated;

create or replace function public.cancel_newsletter_campaign(p_campaign_id uuid)
returns public.newsletter_campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign public.newsletter_campaigns%rowtype;
begin
  if not (select public.newsletter_request_is_editor_or_service()) then
    raise exception 'Newsletter campaign access denied' using errcode = '42501';
  end if;

  perform 1
  from public.newsletter_outbox as cancellable
  where cancellable.campaign_id = p_campaign_id
    and cancellable.status in ('pending', 'retry', 'processing')
  order by cancellable.id
  for update of cancellable;

  select * into campaign
  from public.newsletter_campaigns
  where id = p_campaign_id
  for update;

  if not found then
    raise exception 'Newsletter campaign not found' using errcode = 'P0002';
  end if;
  if campaign.status = 'cancelled' then return campaign; end if;
  if campaign.status not in ('draft', 'scheduled', 'sending') then
    raise exception 'Only draft, scheduled or sending campaigns can be cancelled' using errcode = '22023';
  end if;

  update public.newsletter_outbox
  set status = 'cancelled', worker_id = null, lease_expires_at = null
  where campaign_id = campaign.id
    and status in ('pending', 'retry', 'processing')
    and (status <> 'processing' or dispatch_started_at is null);

  update public.newsletter_campaign_recipients
  set delivery_status = 'cancelled'
  where campaign_id = campaign.id
    and delivery_status in ('pending', 'sending')
    and not exists (
      select 1 from public.newsletter_outbox as active_dispatch
      where active_dispatch.recipient_id = newsletter_campaign_recipients.id
        and active_dispatch.status = 'processing'
        and active_dispatch.dispatch_started_at is not null
    );

  update public.newsletter_campaigns
  set status = 'cancelled', cancelled_at = now()
  where id = campaign.id
  returning * into campaign;

  return campaign;
end;
$$;

revoke all on function public.cancel_newsletter_campaign(uuid) from public;
grant execute on function public.cancel_newsletter_campaign(uuid) to authenticated;

create or replace function public.claim_newsletter_outbox(
  p_limit integer,
  p_worker_id text,
  p_lease_seconds integer default 120
)
returns table (
  outbox_id bigint,
  campaign_id uuid,
  recipient_id uuid,
  subscription_id uuid,
  recipient_email text,
  idempotency_key text,
  attempt smallint,
  locale text,
  subject text,
  preheader text,
  from_name text,
  from_email text,
  reply_to text,
  content_markdown text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  exhausted_campaign uuid;
begin
  if coalesce((select auth.role()) = 'service_role', false) is false then
    raise exception 'Newsletter worker access denied' using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 50 then
    raise exception 'Invalid newsletter batch size' using errcode = '22023';
  end if;
  if char_length(trim(p_worker_id)) not between 8 and 120 then
    raise exception 'Invalid newsletter worker id' using errcode = '22023';
  end if;
  if p_lease_seconds not between 30 and 900 then
    raise exception 'Invalid newsletter lease' using errcode = '22023';
  end if;

  for exhausted_campaign in
    with exhausted as (
      update public.newsletter_outbox as exhausted_outbox set
        status = 'dead',
        worker_id = null,
        lease_expires_at = null,
        last_error = case
          when exhausted_outbox.dispatch_started_at is not null
            then 'Delivery outcome is unknown after the provider dispatch lease expired; automatic retry was stopped.'
          else coalesce(exhausted_outbox.last_error, 'Delivery lease expired after the final attempt.')
        end
      where exhausted_outbox.status = 'processing'
        and exhausted_outbox.lease_expires_at <= now()
        and (
          exhausted_outbox.dispatch_started_at is not null
          or exhausted_outbox.attempts >= exhausted_outbox.max_attempts
        )
      returning
        exhausted_outbox.recipient_id,
        exhausted_outbox.campaign_id,
        exhausted_outbox.last_error
    ), failed_recipients as (
      update public.newsletter_campaign_recipients as recipient set
        delivery_status = 'failed',
        last_error = exhausted.last_error
      from exhausted
      where recipient.id = exhausted.recipient_id
      returning exhausted.campaign_id
    )
    select distinct failed_recipients.campaign_id from failed_recipients
  loop
    perform public.refresh_newsletter_campaign_metrics(exhausted_campaign);
  end loop;

  update public.newsletter_campaigns as campaign
  set status = 'sending', started_at = coalesce(started_at, now())
  where campaign.status = 'scheduled'
    and campaign.scheduled_for <= now()
    and exists (
      select 1 from public.newsletter_outbox as due
      where due.campaign_id = campaign.id
        and due.status in ('pending', 'retry', 'processing')
    );

  return query
  with candidates as (
    select outbox.id
    from public.newsletter_outbox as outbox
    join public.newsletter_campaigns as campaign on campaign.id = outbox.campaign_id
    where campaign.status = 'sending'
      and outbox.available_at <= now()
      and (
        outbox.status in ('pending', 'retry')
        or (
          outbox.status = 'processing'
          and outbox.lease_expires_at <= now()
          and outbox.dispatch_started_at is null
        )
      )
      and outbox.attempts < outbox.max_attempts
    order by outbox.available_at, outbox.id
    for update of outbox skip locked
    limit p_limit
  ), claimed as (
    update public.newsletter_outbox as outbox set
      status = 'processing',
      worker_id = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      dispatch_started_at = null,
      last_error = null
    from candidates
    where outbox.id = candidates.id
    returning outbox.*
  ), recipient_claimed as (
    update public.newsletter_campaign_recipients as recipient
    set delivery_status = 'sending', last_error = null
    from claimed
    where recipient.id = claimed.recipient_id
    returning recipient.id
  )
  select
    claimed.id,
    claimed.campaign_id,
    recipient.id,
    recipient.subscription_id,
    recipient.email,
    claimed.idempotency_key,
    (claimed.attempts + 1)::smallint,
    campaign.locale,
    campaign.subject,
    campaign.preheader,
    campaign.from_name,
    campaign.from_email,
    campaign.reply_to,
    campaign.content_markdown
  from claimed
  join public.newsletter_campaigns as campaign on campaign.id = claimed.campaign_id
  join public.newsletter_campaign_recipients as recipient on recipient.id = claimed.recipient_id
  join recipient_claimed on recipient_claimed.id = recipient.id
  order by claimed.id;
end;
$$;

revoke all on function public.claim_newsletter_outbox(integer, text, integer) from public;

create or replace function public.start_newsletter_outbox_delivery(
  p_outbox_id bigint,
  p_worker_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox public.newsletter_outbox%rowtype;
  delivery_authorized boolean;
begin
  if coalesce((select auth.role()) = 'service_role', false) is false then
    raise exception 'Newsletter worker access denied' using errcode = '42501';
  end if;

  select * into outbox
  from public.newsletter_outbox
  where id = p_outbox_id
  for update;

  if not found
    or outbox.status <> 'processing'
    or outbox.worker_id <> p_worker_id
    or outbox.lease_expires_at <= now()
    or outbox.dispatch_started_at is not null
    or outbox.attempts >= outbox.max_attempts
  then
    return false;
  end if;

  select exists (
    select 1
    from public.newsletter_campaign_recipients as recipient
    join public.newsletter_subscriptions as subscription
      on subscription.id = recipient.subscription_id
    join public.newsletter_campaigns as campaign
      on campaign.id = recipient.campaign_id
    where recipient.id = outbox.recipient_id
      and recipient.delivery_status = 'sending'
      and subscription.status = 'active'
      and subscription.confirmed_at is not null
      and campaign.id = outbox.campaign_id
      and campaign.status = 'sending'
  ) into delivery_authorized;

  if not delivery_authorized then
    update public.newsletter_outbox set
      status = 'cancelled',
      worker_id = null,
      lease_expires_at = null,
      dispatch_started_at = null,
      last_error = 'Delivery authorization was revoked before provider dispatch.'
    where id = outbox.id;

    update public.newsletter_campaign_recipients set
      delivery_status = 'cancelled',
      last_error = 'Delivery authorization was revoked before provider dispatch.'
    where id = outbox.recipient_id
      and delivery_status in ('pending', 'sending');

    perform public.refresh_newsletter_campaign_metrics(outbox.campaign_id);
    return false;
  end if;

  update public.newsletter_outbox
  set
    attempts = attempts + 1,
    dispatch_started_at = now()
  where id = outbox.id;
  return true;
end;
$$;

revoke all on function public.start_newsletter_outbox_delivery(bigint, text) from public;

create or replace function public.reconcile_newsletter_recipient(p_provider_message_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient public.newsletter_campaign_recipients%rowtype;
  final_status text;
begin
  select * into recipient
  from public.newsletter_campaign_recipients
  where provider_message_id = p_provider_message_id
  for update;

  if not found then return null; end if;

  update public.newsletter_delivery_events
  set campaign_id = recipient.campaign_id, recipient_id = recipient.id
  where provider_message_id = p_provider_message_id
    and recipient_id is null;

  select case
    when bool_or(event_type = 'email.complained') then 'complained'
    when bool_or(event_type = 'email.bounced') then 'bounced'
    when bool_or(event_type = 'email.delivered') then 'delivered'
    when bool_or(event_type in ('email.failed', 'email.suppressed')) then 'failed'
    else 'sent'
  end into final_status
  from public.newsletter_delivery_events
  where provider_message_id = p_provider_message_id;

  update public.newsletter_campaign_recipients set
    delivery_status = final_status,
    delivered_at = (
      select max(event_at) from public.newsletter_delivery_events
      where provider_message_id = p_provider_message_id and event_type = 'email.delivered'
    ),
    bounced_at = (
      select max(event_at) from public.newsletter_delivery_events
      where provider_message_id = p_provider_message_id and event_type = 'email.bounced'
    ),
    complained_at = (
      select max(event_at) from public.newsletter_delivery_events
      where provider_message_id = p_provider_message_id and event_type = 'email.complained'
    ),
    opened_at = (
      select min(event_at) from public.newsletter_delivery_events
      where provider_message_id = p_provider_message_id and event_type = 'email.opened'
    ),
    clicked_at = (
      select min(event_at) from public.newsletter_delivery_events
      where provider_message_id = p_provider_message_id and event_type = 'email.clicked'
    )
  where id = recipient.id;

  if final_status in ('bounced', 'complained') and recipient.subscription_id is not null then
    update public.newsletter_subscriptions set
      status = 'suppressed',
      confirmed_at = null,
      suppressed_at = coalesce(suppressed_at, now()),
      suppression_reason = case when final_status = 'bounced' then 'bounce' else 'complaint' end,
      confirmation_token_hash = null,
      confirmation_expires_at = null
    where id = recipient.subscription_id;

  end if;

  perform public.refresh_newsletter_campaign_metrics(recipient.campaign_id);
  return recipient.id;
end;
$$;

revoke all on function public.reconcile_newsletter_recipient(text) from public;

create or replace function public.complete_newsletter_outbox(
  p_outbox_id bigint,
  p_worker_id text,
  p_provider_message_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox public.newsletter_outbox%rowtype;
begin
  if coalesce((select auth.role()) = 'service_role', false) is false then
    raise exception 'Newsletter worker access denied' using errcode = '42501';
  end if;

  select * into outbox from public.newsletter_outbox where id = p_outbox_id for update;
  if not found then return false; end if;
  if outbox.status = 'sent' then
    return outbox.provider_message_id = p_provider_message_id;
  end if;
  if outbox.status <> 'processing'
    or outbox.worker_id <> p_worker_id
    or outbox.dispatch_started_at is null
  then
    return false;
  end if;

  update public.newsletter_outbox set
    status = 'sent',
    provider_message_id = p_provider_message_id,
    sent_at = now(),
    worker_id = null,
    lease_expires_at = null
  where id = outbox.id;

  update public.newsletter_campaign_recipients set
    delivery_status = 'sent',
    provider_message_id = p_provider_message_id,
    sent_at = coalesce(sent_at, now())
  where id = outbox.recipient_id;

  perform public.reconcile_newsletter_recipient(p_provider_message_id);
  return true;
end;
$$;

revoke all on function public.complete_newsletter_outbox(bigint, text, text) from public;

create or replace function public.fail_newsletter_outbox(
  p_outbox_id bigint,
  p_worker_id text,
  p_error text,
  p_retryable boolean,
  p_retry_after_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox public.newsletter_outbox%rowtype;
  retry_delivery boolean;
  delivery_authorized boolean;
begin
  if coalesce((select auth.role()) = 'service_role', false) is false then
    raise exception 'Newsletter worker access denied' using errcode = '42501';
  end if;

  select * into outbox from public.newsletter_outbox where id = p_outbox_id for update;
  if not found or outbox.status <> 'processing' or outbox.worker_id <> p_worker_id then
    return false;
  end if;

  select exists (
    select 1
    from public.newsletter_campaign_recipients as recipient
    join public.newsletter_subscriptions as subscription
      on subscription.id = recipient.subscription_id
    join public.newsletter_campaigns as campaign
      on campaign.id = recipient.campaign_id
    where recipient.id = outbox.recipient_id
      and subscription.status = 'active'
      and subscription.confirmed_at is not null
      and campaign.id = outbox.campaign_id
      and campaign.status = 'sending'
  ) into delivery_authorized;

  retry_delivery := delivery_authorized
    and p_retryable
    and outbox.attempts < outbox.max_attempts;
  update public.newsletter_outbox set
    status = case
      when not delivery_authorized then 'cancelled'
      when retry_delivery then 'retry'
      else 'dead'
    end,
    available_at = case
      when retry_delivery then now() + make_interval(secs => greatest(1, least(p_retry_after_seconds, 86400)))
      else available_at
    end,
    last_error = left(p_error, 2000),
    worker_id = null,
    lease_expires_at = null,
    dispatch_started_at = null
  where id = outbox.id;

  update public.newsletter_campaign_recipients set
    delivery_status = case
      when not delivery_authorized then 'cancelled'
      when retry_delivery then 'pending'
      else 'failed'
    end,
    last_error = left(p_error, 2000)
  where id = outbox.recipient_id;

  perform public.refresh_newsletter_campaign_metrics(outbox.campaign_id);
  return true;
end;
$$;

revoke all on function public.fail_newsletter_outbox(bigint, text, text, boolean, integer) from public;

create or replace function public.record_newsletter_delivery_event(
  p_webhook_id text,
  p_provider_message_id text,
  p_event_type text,
  p_event_at timestamptz,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_id bigint;
begin
  if coalesce((select auth.role()) = 'service_role', false) is false then
    raise exception 'Newsletter webhook access denied' using errcode = '42501';
  end if;

  insert into public.newsletter_delivery_events (
    webhook_id,
    provider_message_id,
    event_type,
    event_at,
    payload
  ) values (
    p_webhook_id,
    p_provider_message_id,
    p_event_type,
    p_event_at,
    p_payload
  )
  on conflict (webhook_id) do nothing
  returning id into inserted_id;

  if inserted_id is null then return false; end if;
  perform public.reconcile_newsletter_recipient(p_provider_message_id);
  return true;
end;
$$;

revoke all on function public.record_newsletter_delivery_event(text, text, text, timestamptz, jsonb) from public;

create or replace function public.register_newsletter_suppression(
  p_provider_message_id text,
  p_email_hash text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_subscription_id uuid;
  affected_campaign uuid;
begin
  if coalesce((select auth.role()) = 'service_role', false) is false then
    raise exception 'Newsletter suppression access denied' using errcode = '42501';
  end if;
  if p_email_hash !~ '^[a-f0-9]{64}$' or p_reason not in ('bounce', 'complaint') then
    raise exception 'Invalid newsletter suppression' using errcode = '22023';
  end if;

  select recipient.subscription_id into target_subscription_id
  from public.newsletter_campaign_recipients as recipient
  where recipient.provider_message_id = p_provider_message_id;

  if target_subscription_id is null then return false; end if;

  insert into public.newsletter_suppressions (email_hash, reason)
  values (p_email_hash, p_reason)
  on conflict (email_hash) do update set reason = excluded.reason;

  update public.newsletter_outbox as outbox set
    status = 'cancelled', worker_id = null, lease_expires_at = null
  from public.newsletter_campaign_recipients as recipient
  where recipient.subscription_id = target_subscription_id
    and recipient.id = outbox.recipient_id
    and outbox.status in ('pending', 'retry', 'processing')
    and (outbox.status <> 'processing' or outbox.dispatch_started_at is null);

  update public.newsletter_campaign_recipients as recipient set
    delivery_status = 'cancelled'
  where recipient.subscription_id = target_subscription_id
    and recipient.provider_message_id is distinct from p_provider_message_id
    and recipient.delivery_status in ('pending', 'sending')
    and not exists (
      select 1 from public.newsletter_outbox as active_dispatch
      where active_dispatch.recipient_id = recipient.id
        and active_dispatch.status = 'processing'
        and active_dispatch.dispatch_started_at is not null
    );

  update public.newsletter_subscriptions set
    status = 'suppressed',
    confirmed_at = null,
    suppressed_at = coalesce(suppressed_at, now()),
    suppression_reason = p_reason,
    confirmation_token_hash = null,
    confirmation_expires_at = null
  where id = target_subscription_id;

  for affected_campaign in
    select distinct campaign_id
    from public.newsletter_campaign_recipients
    where subscription_id = target_subscription_id
  loop
    perform public.refresh_newsletter_campaign_metrics(affected_campaign);
  end loop;

  return true;
end;
$$;

revoke all on function public.register_newsletter_suppression(text, text, text) from public;

create or replace function public.erase_newsletter_subscription(
  p_subscription_id uuid,
  p_email_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_campaign uuid;
begin
  if not (select public.newsletter_request_is_editor_or_service()) then
    raise exception 'Newsletter erasure access denied' using errcode = '42501';
  end if;
  if p_email_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid newsletter erasure hash' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.newsletter_subscriptions where id = p_subscription_id
  ) then
    return false;
  end if;

  insert into public.newsletter_suppressions (email_hash, reason)
  values (p_email_hash, 'erasure')
  on conflict (email_hash) do update set reason = 'erasure';

  update public.newsletter_delivery_events as event set
    payload = (event.payload - 'to' - 'from' - 'email')
      #- '{data,to}'
      #- '{data,from}'
      #- '{data,email}'
  from public.newsletter_campaign_recipients as recipient
  where recipient.subscription_id = p_subscription_id
    and event.recipient_id = recipient.id;

  update public.newsletter_outbox as outbox set
    status = 'cancelled', worker_id = null, lease_expires_at = null
  from public.newsletter_campaign_recipients as recipient
  where recipient.subscription_id = p_subscription_id
    and recipient.id = outbox.recipient_id
    and outbox.status in ('pending', 'retry', 'processing')
    and (outbox.status <> 'processing' or outbox.dispatch_started_at is null);

  for affected_campaign in
    with erased_recipients as (
      update public.newsletter_campaign_recipients set
        email = 'erased+' || id::text || '@invalid.local',
        subscription_id = null,
        delivery_status = case
          when delivery_status in ('pending', 'sending') and not exists (
            select 1 from public.newsletter_outbox as active_dispatch
            where active_dispatch.recipient_id = newsletter_campaign_recipients.id
              and active_dispatch.status = 'processing'
              and active_dispatch.dispatch_started_at is not null
          ) then 'cancelled'
          else delivery_status
        end
      where subscription_id = p_subscription_id
      returning campaign_id
    )
    select distinct campaign_id from erased_recipients
  loop
    perform public.refresh_newsletter_campaign_metrics(affected_campaign);
  end loop;

  update public.newsletter_subscriptions set
    email = 'erased+' || id::text || '@invalid.local',
    source = 'erased',
    status = 'suppressed',
    confirmation_token_hash = null,
    confirmation_expires_at = null,
    confirmed_at = null,
    unsubscribed_at = coalesce(unsubscribed_at, now()),
    suppressed_at = coalesce(suppressed_at, now()),
    suppression_reason = 'erasure'
  where id = p_subscription_id;

  return true;
end;
$$;

revoke all on function public.erase_newsletter_subscription(uuid, text) from public;

create or replace function public.unsubscribe_newsletter_recipient(
  p_subscription_id uuid,
  p_recipient_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed boolean;
  affected_campaign uuid;
begin
  if coalesce((select auth.role()) = 'service_role', false) is false then
    raise exception 'Newsletter unsubscribe access denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.newsletter_campaign_recipients
    where id = p_recipient_id and subscription_id = p_subscription_id
  ) then
    return false;
  end if;

  update public.newsletter_outbox as outbox set
    status = 'cancelled', worker_id = null, lease_expires_at = null
  from public.newsletter_campaign_recipients as recipient
  where recipient.subscription_id = p_subscription_id
    and recipient.id = outbox.recipient_id
    and outbox.status in ('pending', 'retry', 'processing')
    and (outbox.status <> 'processing' or outbox.dispatch_started_at is null);

  update public.newsletter_campaign_recipients as recipient set delivery_status = 'cancelled'
  where recipient.subscription_id = p_subscription_id
    and recipient.delivery_status in ('pending', 'sending')
    and not exists (
      select 1 from public.newsletter_outbox as active_dispatch
      where active_dispatch.recipient_id = recipient.id
        and active_dispatch.status = 'processing'
        and active_dispatch.dispatch_started_at is not null
    );

  update public.newsletter_subscriptions set
    status = 'unsubscribed',
    confirmed_at = null,
    unsubscribed_at = coalesce(unsubscribed_at, now()),
    confirmation_token_hash = null,
    confirmation_expires_at = null,
    confirmation_claimed_at = null
  where id = p_subscription_id;
  changed := found;

  for affected_campaign in
    select distinct campaign_id
    from public.newsletter_campaign_recipients
    where subscription_id = p_subscription_id
  loop
    perform public.refresh_newsletter_campaign_metrics(affected_campaign);
  end loop;

  return changed;
end;
$$;

revoke all on function public.unsubscribe_newsletter_recipient(uuid, uuid) from public;

create or replace function public.admin_unsubscribe_newsletter_subscription(
  p_subscription_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_campaign uuid;
begin
  if not (select public.newsletter_request_is_editor_or_service()) then
    raise exception 'Newsletter unsubscribe access denied' using errcode = '42501';
  end if;

  update public.newsletter_subscriptions set
    status = 'unsubscribed',
    confirmed_at = null,
    unsubscribed_at = coalesce(unsubscribed_at, now()),
    confirmation_token_hash = null,
    confirmation_expires_at = null,
    confirmation_claimed_at = null
  where id = p_subscription_id
    and status <> 'suppressed';

  if not found then return false; end if;

  update public.newsletter_outbox as outbox set
    status = 'cancelled',
    worker_id = null,
    lease_expires_at = null
  from public.newsletter_campaign_recipients as recipient
  where recipient.subscription_id = p_subscription_id
    and recipient.id = outbox.recipient_id
    and outbox.status in ('pending', 'retry', 'processing')
    and (outbox.status <> 'processing' or outbox.dispatch_started_at is null);

  update public.newsletter_campaign_recipients set
    delivery_status = 'cancelled'
  where subscription_id = p_subscription_id
    and delivery_status in ('pending', 'sending')
    and not exists (
      select 1 from public.newsletter_outbox as active_dispatch
      where active_dispatch.recipient_id = newsletter_campaign_recipients.id
        and active_dispatch.status = 'processing'
        and active_dispatch.dispatch_started_at is not null
    );

  for affected_campaign in
    select distinct campaign_id
    from public.newsletter_campaign_recipients
    where subscription_id = p_subscription_id
  loop
    perform public.refresh_newsletter_campaign_metrics(affected_campaign);
  end loop;

  return true;
end;
$$;

revoke all on function public.admin_unsubscribe_newsletter_subscription(uuid) from public;
grant execute on function public.admin_unsubscribe_newsletter_subscription(uuid) to authenticated;
revoke update on table public.newsletter_subscriptions from authenticated;

alter table public.newsletter_campaigns enable row level security;
alter table public.newsletter_campaign_recipients enable row level security;
alter table public.newsletter_outbox enable row level security;
alter table public.newsletter_delivery_events enable row level security;
alter table public.newsletter_suppressions enable row level security;
alter table public.newsletter_subscription_request_limits enable row level security;
alter table public.newsletter_subscription_request_limits force row level security;

drop policy if exists newsletter_subscription_request_limits_service_only
  on public.newsletter_subscription_request_limits;
create policy newsletter_subscription_request_limits_service_only
  on public.newsletter_subscription_request_limits
  for all to public
  using (coalesce((select auth.role()) = 'service_role', false))
  with check (coalesce((select auth.role()) = 'service_role', false));

drop policy if exists newsletter_campaigns_editor_read on public.newsletter_campaigns;
create policy newsletter_campaigns_editor_read on public.newsletter_campaigns
  for select to authenticated using ((select public.is_editor()));
drop policy if exists newsletter_campaigns_editor_insert on public.newsletter_campaigns;
create policy newsletter_campaigns_editor_insert on public.newsletter_campaigns
  for insert to authenticated with check (
    (select public.is_editor()) and created_by = (select auth.uid())
  );
drop policy if exists newsletter_campaigns_editor_update on public.newsletter_campaigns;
create policy newsletter_campaigns_editor_update on public.newsletter_campaigns
  for update to authenticated
  using ((select public.is_editor()))
  with check ((select public.is_editor()));

drop policy if exists newsletter_recipients_editor_read on public.newsletter_campaign_recipients;
create policy newsletter_recipients_editor_read on public.newsletter_campaign_recipients
  for select to authenticated using ((select public.is_editor()));
drop policy if exists newsletter_outbox_editor_read on public.newsletter_outbox;
create policy newsletter_outbox_editor_read on public.newsletter_outbox
  for select to authenticated using ((select public.is_editor()));
drop policy if exists newsletter_events_editor_read on public.newsletter_delivery_events;
create policy newsletter_events_editor_read on public.newsletter_delivery_events
  for select to authenticated using ((select public.is_editor()));

revoke all on
  public.newsletter_campaigns,
  public.newsletter_campaign_recipients,
  public.newsletter_outbox,
  public.newsletter_delivery_events,
  public.newsletter_suppressions,
  public.newsletter_subscription_request_limits
from public, anon, authenticated;

grant select on public.newsletter_campaigns to authenticated;
grant insert (
  locale,
  subject,
  preheader,
  from_name,
  from_email,
  reply_to,
  content_markdown,
  content_html,
  audience_locale,
  audience_status,
  created_by
) on public.newsletter_campaigns to authenticated;
grant update (
  locale,
  subject,
  preheader,
  from_name,
  from_email,
  reply_to,
  content_markdown,
  content_html,
  audience_locale,
  audience_status
) on public.newsletter_campaigns to authenticated;
grant select on
  public.newsletter_campaign_recipients,
  public.newsletter_outbox,
  public.newsletter_delivery_events
to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.newsletter_request_is_editor_or_service() to service_role';
    execute 'grant execute on function public.request_newsletter_subscription(text, text, text, text, text, text, timestamptz) to service_role';
    execute 'grant execute on function public.complete_newsletter_confirmation(uuid, text, text) to service_role';
    execute 'grant execute on function public.release_newsletter_confirmation(uuid, text) to service_role';
    execute 'grant execute on function public.confirm_newsletter_subscription(uuid, text) to service_role';
    execute 'grant execute on function public.queue_newsletter_campaign(uuid, timestamptz) to service_role';
    execute 'grant execute on function public.cancel_newsletter_campaign(uuid) to service_role';
    execute 'grant execute on function public.claim_newsletter_outbox(integer, text, integer) to service_role';
    execute 'grant execute on function public.start_newsletter_outbox_delivery(bigint, text) to service_role';
    execute 'grant execute on function public.complete_newsletter_outbox(bigint, text, text) to service_role';
    execute 'grant execute on function public.fail_newsletter_outbox(bigint, text, text, boolean, integer) to service_role';
    execute 'grant execute on function public.record_newsletter_delivery_event(text, text, text, timestamptz, jsonb) to service_role';
    execute 'grant execute on function public.register_newsletter_suppression(text, text, text) to service_role';
    execute 'grant execute on function public.unsubscribe_newsletter_recipient(uuid, uuid) to service_role';
    execute 'grant execute on function public.admin_unsubscribe_newsletter_subscription(uuid) to service_role';
    execute 'grant execute on function public.erase_newsletter_subscription(uuid, text) to service_role';
    execute 'grant select, insert, update on public.newsletter_campaigns to service_role';
    execute 'grant select on public.newsletter_subscriptions to service_role';
    execute 'grant select on public.newsletter_campaign_recipients, public.newsletter_outbox, public.newsletter_delivery_events to service_role';
    execute 'grant select, insert, update on public.newsletter_suppressions to service_role';
  end if;
end;
$$;
