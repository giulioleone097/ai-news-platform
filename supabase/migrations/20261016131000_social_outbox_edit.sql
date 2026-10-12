-- Editing a queued social job and cancelling several at once, for admin_social_update and
-- admin_social_cancel_jobs. Both run as one transaction and are callable by the service role only.

-- Replaces the payload, send time and attempt cap of a job that is pending and was never dispatched. The
-- job keeps its publication and idempotency key; the revision guard rejects an edit based on a stale read.
create or replace function public.update_pending_social_outbox(
  p_id uuid,
  p_expected_revision bigint,
  p_provider text,
  p_payload jsonb,
  p_available_at timestamptz,
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
    or p_available_at is null
    or p_max_attempts not between 1 and 10
    or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 16384
    or char_length(trim(coalesce(p_payload ->> 'text', ''))) not between 1 and 4096
  then
    raise exception 'Invalid social update input' using errcode = '22023';
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
    max_attempts = p_max_attempts,
    available_at = p_available_at,
    revision = revision + 1
  where id = p_id
    and provider = p_provider
    and revision = p_expected_revision
    and status = 'pending'
    and dispatch_started_at is null
  returning * into v_job;

  if v_job.id is null then
    raise exception 'Outbox job is not pending or changed' using errcode = 'P0002';
  end if;
  return v_job;
end;
$$;

-- Cancels every job or none: cancel_social_outbox raises for a job that is no longer pending, which rolls
-- the whole call back.
create or replace function public.cancel_social_outbox_batch(p_ids uuid[])
returns setof public.social_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_ids is null
    or cardinality(p_ids) not between 1 and 25
    or cardinality(p_ids) <> (select count(distinct job_id) from unnest(p_ids) as job_id)
  then
    raise exception 'Invalid social cancel batch' using errcode = '22023';
  end if;

  foreach v_id in array p_ids loop
    return query select * from public.cancel_social_outbox(v_id);
  end loop;
  return;
end;
$$;

revoke all on function public.update_pending_social_outbox(uuid, bigint, text, jsonb, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.cancel_social_outbox_batch(uuid[]) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.update_pending_social_outbox(uuid, bigint, text, jsonb, timestamptz, integer) to service_role';
    execute 'grant execute on function public.cancel_social_outbox_batch(uuid[]) to service_role';
  end if;
end;
$$;
