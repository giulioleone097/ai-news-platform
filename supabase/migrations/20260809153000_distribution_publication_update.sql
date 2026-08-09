create or replace function public.update_distribution_publication(
  p_id uuid,
  p_status text,
  p_message text,
  p_external_url text,
  p_scheduled_for timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_status not in ('draft', 'ready', 'published', 'failed') then
    raise exception 'Invalid distribution status' using errcode = '22023';
  end if;

  update public.social_publications set
    status = p_status,
    message = nullif(trim(p_message), ''),
    external_url = nullif(trim(p_external_url), ''),
    scheduled_for = p_scheduled_for,
    published_at = case
      when p_status = 'published' then coalesce(published_at, now())
      else null
    end
  where id = p_id;

  if not found then
    raise exception 'Distribution publication not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_distribution_publication(
  uuid,
  text,
  text,
  text,
  timestamptz
) from public;

grant execute on function public.update_distribution_publication(
  uuid,
  text,
  text,
  text,
  timestamptz
) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute $grant$
      grant execute on function public.update_distribution_publication(
        uuid, text, text, text, timestamptz
      ) to service_role
    $grant$;
  end if;
end;
$$;
