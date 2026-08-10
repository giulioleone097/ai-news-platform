create table if not exists public.social_outbox (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null unique
    references public.social_publications(id) on delete cascade,
  provider text not null check (provider in ('linkedin', 'x', 'whatsapp')),
  idempotency_key text not null unique
    check (
      char_length(idempotency_key) between 16 and 160
      and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9:._/-]+$'
    ),
  payload jsonb not null
    check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 16384),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts smallint not null default 0 check (attempts between 0 and 100),
  max_attempts smallint not null default 5 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  dispatch_started_at timestamptz,
  provider_message_id text check (char_length(provider_message_id) <= 512),
  provider_url text check (char_length(provider_url) <= 2048),
  provider_status text check (char_length(provider_status) <= 80),
  provider_status_at timestamptz,
  revision bigint not null default 0 check (revision >= 0),
  requeue_source_revision bigint check (requeue_source_revision >= 0),
  retry_safe boolean not null default true,
  last_error_code text check (char_length(last_error_code) <= 80),
  last_error_message text check (char_length(last_error_message) <= 400),
  sent_at timestamptz,
  failed_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_outbox_lease_state_check check (
    (status = 'processing' and lease_token is not null and lease_expires_at is not null)
    or (status <> 'processing' and lease_token is null and lease_expires_at is null)
  )
);

create index if not exists social_outbox_pending_idx
  on public.social_outbox (available_at, created_at, id)
  where status = 'pending';

create index if not exists social_outbox_processing_lease_idx
  on public.social_outbox (lease_expires_at, id)
  where status = 'processing';

create unique index if not exists social_outbox_provider_message_idx
  on public.social_outbox (provider, provider_message_id)
  where provider_message_id is not null;

drop trigger if exists social_outbox_set_updated_at on public.social_outbox;
create trigger social_outbox_set_updated_at
before update on public.social_outbox
for each row execute function public.set_updated_at();

alter table public.social_outbox enable row level security;
alter table public.social_outbox force row level security;
revoke all on table public.social_outbox from public, anon, authenticated;

create or replace function public.enqueue_social_outbox(
  p_publication_id uuid,
  p_provider text,
  p_idempotency_key text,
  p_payload jsonb,
  p_scheduled_for timestamptz,
  p_max_attempts integer
)
returns public.social_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel text;
  v_job public.social_outbox%rowtype;
begin
  if p_provider not in ('linkedin', 'x', 'whatsapp') then
    raise exception 'Invalid social provider' using errcode = '22023';
  end if;
  if char_length(p_idempotency_key) not between 16 and 160
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:._/-]+$'
  then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;
  if p_max_attempts not between 1 and 10 then
    raise exception 'Invalid max attempts' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 16384
    or char_length(trim(coalesce(p_payload ->> 'text', ''))) not between 1 and 4096
  then
    raise exception 'Invalid social payload' using errcode = '22023';
  end if;
  if nullif(p_payload ->> 'articleUrl', '') is not null
    and (p_payload ->> 'articleUrl') !~ '^https://'
  then
    raise exception 'Invalid article URL' using errcode = '22023';
  end if;
  if p_provider = 'whatsapp' then
    if coalesce(p_payload ->> 'recipient', '') !~ '^[1-9][0-9]{6,14}$' then
      raise exception 'WhatsApp recipient is required' using errcode = '22023';
    end if;
  elsif p_payload ? 'recipient' then
    raise exception 'Recipient is only valid for WhatsApp' using errcode = '22023';
  end if;

  select channel into v_channel
  from public.social_publications
  where id = p_publication_id;
  if v_channel is null then
    raise exception 'Distribution publication not found' using errcode = 'P0002';
  end if;
  if v_channel <> p_provider then
    raise exception 'Publication channel does not match provider' using errcode = '22023';
  end if;

  insert into public.social_outbox (
    publication_id,
    provider,
    idempotency_key,
    payload,
    available_at,
    max_attempts
  ) values (
    p_publication_id,
    p_provider,
    p_idempotency_key,
    p_payload,
    coalesce(p_scheduled_for, now()),
    p_max_attempts
  )
  on conflict do nothing
  returning * into v_job;

  if v_job.id is null then
    select * into v_job
    from public.social_outbox
    where publication_id = p_publication_id
       or idempotency_key = p_idempotency_key
    order by (idempotency_key = p_idempotency_key) desc
    limit 1;
    if v_job.id is null
      or v_job.publication_id <> p_publication_id
      or v_job.provider <> p_provider
      or v_job.idempotency_key <> p_idempotency_key
      or v_job.payload <> p_payload
    then
      raise exception 'Idempotency key reuse mismatch' using errcode = '23505';
    end if;
  end if;

  return v_job;
end;
$$;

create or replace function public.requeue_social_outbox(
  p_id uuid,
  p_expected_revision bigint,
  p_publication_id uuid,
  p_provider text,
  p_payload jsonb,
  p_scheduled_for timestamptz,
  p_max_attempts integer
)
returns public.social_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare v_job public.social_outbox%rowtype;
begin
  if p_provider not in ('linkedin', 'x', 'whatsapp')
    or p_expected_revision is null or p_expected_revision < 0
    or p_max_attempts not between 1 and 10
    or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 16384
    or char_length(trim(coalesce(p_payload ->> 'text', ''))) not between 1 and 4096
  then
    raise exception 'Invalid social requeue input' using errcode = '22023';
  end if;
  if nullif(p_payload ->> 'articleUrl', '') is not null
    and (p_payload ->> 'articleUrl') !~ '^https://'
  then
    raise exception 'Invalid article URL' using errcode = '22023';
  end if;
  if p_provider = 'whatsapp' then
    if coalesce(p_payload ->> 'recipient', '') !~ '^[1-9][0-9]{6,14}$' then
      raise exception 'WhatsApp recipient is required' using errcode = '22023';
    end if;
  elsif p_payload ? 'recipient' then
    raise exception 'Recipient is only valid for WhatsApp' using errcode = '22023';
  end if;

  update public.social_outbox set
    payload = p_payload,
    status = 'pending',
    attempts = 0,
    max_attempts = p_max_attempts,
    available_at = coalesce(p_scheduled_for, now()),
    lease_token = null,
    lease_expires_at = null,
    dispatch_started_at = null,
    provider_message_id = null,
    provider_url = null,
    provider_status = null,
    provider_status_at = null,
    revision = revision + 1,
    requeue_source_revision = p_expected_revision,
    retry_safe = true,
    last_error_code = null,
    last_error_message = null,
    sent_at = null,
    failed_at = null,
    delivered_at = null,
    read_at = null
  where id = p_id
    and publication_id = p_publication_id
    and provider = p_provider
    and revision = p_expected_revision
    and (
      status = 'cancelled'
      or (status = 'failed' and retry_safe = true)
    )
  returning * into v_job;

  if v_job.id is null then
    select * into v_job from public.social_outbox where id = p_id;
    if v_job.id is null
      or v_job.publication_id <> p_publication_id
      or v_job.provider <> p_provider
      or v_job.status = 'cancelled'
      or v_job.requeue_source_revision is distinct from p_expected_revision
      or v_job.payload <> p_payload
      or v_job.max_attempts <> p_max_attempts
    then
      raise exception 'Outbox job is not safely requeueable or changed' using errcode = 'P0002';
    end if;
  end if;

  update public.social_publications set
    status = 'ready',
    external_url = null,
    published_at = null
  where id = v_job.publication_id
    and v_job.status in ('pending', 'processing');
  return v_job;
end;
$$;

create or replace function public.claim_social_outbox(
  p_worker_token uuid,
  p_limit integer default 10,
  p_lease_seconds integer default 90
)
returns setof public.social_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit not between 1 and 25 or p_lease_seconds not between 30 and 300 then
    raise exception 'Invalid claim bounds' using errcode = '22023';
  end if;

  update public.social_outbox set
    status = 'failed',
    revision = revision + 1,
    lease_token = null,
    lease_expires_at = null,
    retry_safe = false,
    last_error_code = 'lease_expired_after_dispatch',
    last_error_message = 'Dispatch outcome requires manual reconciliation.',
    failed_at = coalesce(failed_at, now())
  where status = 'processing'
    and lease_expires_at <= now()
    and dispatch_started_at is not null;

  update public.social_outbox set
    status = 'failed',
    revision = revision + 1,
    lease_token = null,
    lease_expires_at = null,
    retry_safe = true,
    last_error_code = 'max_attempts_before_dispatch',
    last_error_message = 'Maximum attempts reached before provider dispatch.',
    failed_at = coalesce(failed_at, now())
  where status = 'processing'
    and lease_expires_at <= now()
    and dispatch_started_at is null
    and attempts >= max_attempts;

  update public.social_publications publication set
    status = 'failed'
  where exists (
    select 1 from public.social_outbox outbox
    where outbox.publication_id = publication.id
      and outbox.status = 'failed'
      and outbox.last_error_code in (
        'lease_expired_after_dispatch',
        'max_attempts_before_dispatch'
      )
  );

  return query
  with candidates as (
    select outbox.id
    from public.social_outbox outbox
    where (
      outbox.status = 'pending'
      and outbox.available_at <= now()
      and outbox.attempts < outbox.max_attempts
    ) or (
      outbox.status = 'processing'
      and outbox.lease_expires_at <= now()
      and outbox.dispatch_started_at is null
      and outbox.attempts < outbox.max_attempts
    )
    order by outbox.available_at, outbox.created_at, outbox.id
    limit p_limit
    for update skip locked
  )
  update public.social_outbox outbox set
    status = 'processing',
    revision = outbox.revision + 1,
    attempts = outbox.attempts + 1,
    lease_token = p_worker_token,
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    dispatch_started_at = null,
    retry_safe = true,
    last_error_code = null,
    last_error_message = null,
    failed_at = null
  from candidates
  where outbox.id = candidates.id
  returning outbox.*;
end;
$$;

create or replace function public.mark_social_outbox_dispatch_started(
  p_id uuid,
  p_worker_token uuid
)
returns public.social_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare v_job public.social_outbox%rowtype;
begin
  update public.social_outbox set
    dispatch_started_at = now(),
    revision = revision + 1
  where id = p_id
    and status = 'processing'
    and lease_token = p_worker_token
    and lease_expires_at > now()
    and dispatch_started_at is null
  returning * into v_job;
  if v_job.id is null then
    raise exception 'Outbox lease is not active' using errcode = 'P0002';
  end if;
  return v_job;
end;
$$;

create or replace function public.complete_social_outbox(
  p_id uuid,
  p_worker_token uuid,
  p_provider_message_id text,
  p_provider_url text,
  p_provider_status text
)
returns public.social_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare v_job public.social_outbox%rowtype;
begin
  if char_length(trim(p_provider_message_id)) not between 1 and 512
    or char_length(coalesce(p_provider_url, '')) > 2048
    or char_length(trim(p_provider_status)) not between 1 and 80
  then
    raise exception 'Invalid provider receipt' using errcode = '22023';
  end if;
  update public.social_outbox set
    status = 'sent',
    revision = revision + 1,
    lease_token = null,
    lease_expires_at = null,
    provider_message_id = trim(p_provider_message_id),
    provider_url = nullif(trim(coalesce(p_provider_url, '')), ''),
    provider_status = trim(p_provider_status),
    retry_safe = false,
    sent_at = coalesce(sent_at, now()),
    failed_at = null,
    last_error_code = null,
    last_error_message = null
  where id = p_id
    and status = 'processing'
    and lease_token = p_worker_token
    and lease_expires_at > now()
    and dispatch_started_at is not null
  returning * into v_job;
  if v_job.id is null then
    raise exception 'Outbox lease is not active' using errcode = 'P0002';
  end if;
  update public.social_publications set
    status = 'published',
    external_url = v_job.provider_url,
    published_at = coalesce(published_at, now())
  where id = v_job.publication_id;
  return v_job;
end;
$$;

create or replace function public.retry_social_outbox(
  p_id uuid,
  p_worker_token uuid,
  p_available_at timestamptz,
  p_error_code text,
  p_error_message text
)
returns public.social_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare v_job public.social_outbox%rowtype;
begin
  update public.social_outbox set
    status = case when attempts >= max_attempts then 'failed' else 'pending' end,
    revision = revision + 1,
    available_at = p_available_at,
    lease_token = null,
    lease_expires_at = null,
    dispatch_started_at = null,
    retry_safe = true,
    last_error_code = left(trim(p_error_code), 80),
    last_error_message = left(trim(p_error_message), 400),
    failed_at = case when attempts >= max_attempts then now() else null end
  where id = p_id
    and status = 'processing'
    and lease_token = p_worker_token
  returning * into v_job;
  if v_job.id is null then
    raise exception 'Outbox lease is not active' using errcode = 'P0002';
  end if;
  if v_job.status = 'failed' then
    update public.social_publications set status = 'failed' where id = v_job.publication_id;
  end if;
  return v_job;
end;
$$;

create or replace function public.fail_social_outbox(
  p_id uuid,
  p_worker_token uuid,
  p_error_code text,
  p_error_message text,
  p_retry_safe boolean
)
returns public.social_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare v_job public.social_outbox%rowtype;
begin
  update public.social_outbox set
    status = 'failed',
    revision = revision + 1,
    lease_token = null,
    lease_expires_at = null,
    retry_safe = p_retry_safe,
    last_error_code = left(trim(p_error_code), 80),
    last_error_message = left(trim(p_error_message), 400),
    failed_at = coalesce(failed_at, now())
  where id = p_id
    and status = 'processing'
    and lease_token = p_worker_token
  returning * into v_job;
  if v_job.id is null then
    raise exception 'Outbox lease is not active' using errcode = 'P0002';
  end if;
  update public.social_publications set status = 'failed' where id = v_job.publication_id;
  return v_job;
end;
$$;

create or replace function public.cancel_social_outbox(p_id uuid)
returns public.social_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare v_job public.social_outbox%rowtype;
begin
  update public.social_outbox set
    status = 'cancelled',
    revision = revision + 1,
    retry_safe = false
  where id = p_id
    and status = 'pending'
    and dispatch_started_at is null
  returning * into v_job;
  if v_job.id is null then
    raise exception 'Only pending outbox jobs can be cancelled' using errcode = 'P0002';
  end if;
  update public.social_publications set status = 'draft' where id = v_job.publication_id;
  return v_job;
end;
$$;

create or replace function public.retry_failed_social_outbox(p_id uuid)
returns public.social_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare v_job public.social_outbox%rowtype;
begin
  update public.social_outbox set
    status = 'pending',
    revision = revision + 1,
    attempts = 0,
    available_at = now(),
    dispatch_started_at = null,
    retry_safe = true,
    last_error_code = null,
    last_error_message = null,
    failed_at = null
  where id = p_id
    and status = 'failed'
    and retry_safe = true
  returning * into v_job;
  if v_job.id is null then
    raise exception 'Failed job cannot be retried safely' using errcode = 'P0002';
  end if;
  update public.social_publications set status = 'ready' where id = v_job.publication_id;
  return v_job;
end;
$$;

create or replace function public.apply_social_provider_status(
  p_provider text,
  p_provider_message_id text,
  p_status text,
  p_occurred_at timestamptz,
  p_error_code text,
  p_error_message text
)
returns public.social_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.social_outbox%rowtype;
  v_incoming_rank integer;
begin
  if p_provider <> 'whatsapp'
    or p_status not in ('sent', 'delivered', 'read', 'failed')
    or char_length(trim(p_provider_message_id)) not between 1 and 512
    or p_occurred_at is null
  then
    raise exception 'Invalid provider status' using errcode = '22023';
  end if;

  v_incoming_rank := case p_status
    when 'read' then 4
    when 'delivered' then 3
    when 'failed' then 2
    when 'sent' then 1
  end;

  update public.social_outbox set
    status = case when p_status = 'failed' then 'failed' else 'sent' end,
    revision = revision + 1,
    provider_status = p_status,
    provider_status_at = p_occurred_at,
    retry_safe = case when p_status = 'failed' then false else retry_safe end,
    delivered_at = case when p_status in ('delivered', 'read') then coalesce(delivered_at, p_occurred_at) else delivered_at end,
    read_at = case when p_status = 'read' then coalesce(read_at, p_occurred_at) else read_at end,
    failed_at = case when p_status = 'failed' then coalesce(failed_at, p_occurred_at) else null end,
    last_error_code = case when p_status = 'failed' then left(trim(coalesce(p_error_code, 'whatsapp_delivery_failed')), 80) else null end,
    last_error_message = case when p_status = 'failed' then left(trim(coalesce(p_error_message, 'WhatsApp delivery failed.')), 400) else null end
  where provider = p_provider
    and provider_message_id = trim(p_provider_message_id)
    and status in ('sent', 'failed')
    and v_incoming_rank >= case provider_status
      when 'read' then 4
      when 'delivered' then 3
      when 'failed' then 2
      when 'sent' then 1
      else 0
    end
    and (
      provider_status_at is null
      or p_occurred_at > provider_status_at
      or (
        p_occurred_at = provider_status_at
        and v_incoming_rank > case provider_status
          when 'read' then 4
          when 'delivered' then 3
          when 'failed' then 2
          when 'sent' then 1
          else 0
        end
      )
    )
  returning * into v_job;
  if v_job.id is not null then
    if p_status = 'failed' then
      update public.social_publications set status = 'failed' where id = v_job.publication_id;
    else
      update public.social_publications set
        status = 'published',
        published_at = coalesce(published_at, p_occurred_at)
      where id = v_job.publication_id;
    end if;
  end if;
  return v_job;
end;
$$;

revoke all on function public.enqueue_social_outbox(uuid, text, text, jsonb, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.requeue_social_outbox(uuid, bigint, uuid, text, jsonb, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.claim_social_outbox(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.mark_social_outbox_dispatch_started(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_social_outbox(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.retry_social_outbox(uuid, uuid, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.fail_social_outbox(uuid, uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.cancel_social_outbox(uuid) from public, anon, authenticated;
revoke all on function public.retry_failed_social_outbox(uuid) from public, anon, authenticated;
revoke all on function public.apply_social_provider_status(text, text, text, timestamptz, text, text) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update on table public.social_outbox to service_role;
    grant execute on function public.enqueue_social_outbox(uuid, text, text, jsonb, timestamptz, integer) to service_role;
    grant execute on function public.requeue_social_outbox(uuid, bigint, uuid, text, jsonb, timestamptz, integer) to service_role;
    grant execute on function public.claim_social_outbox(uuid, integer, integer) to service_role;
    grant execute on function public.mark_social_outbox_dispatch_started(uuid, uuid) to service_role;
    grant execute on function public.complete_social_outbox(uuid, uuid, text, text, text) to service_role;
    grant execute on function public.retry_social_outbox(uuid, uuid, timestamptz, text, text) to service_role;
    grant execute on function public.fail_social_outbox(uuid, uuid, text, text, boolean) to service_role;
    grant execute on function public.cancel_social_outbox(uuid) to service_role;
    grant execute on function public.retry_failed_social_outbox(uuid) to service_role;
    grant execute on function public.apply_social_provider_status(text, text, text, timestamptz, text, text) to service_role;
  end if;
end;
$$;
