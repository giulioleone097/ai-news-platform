-- Moderates several comments in one transaction, for the admin_moderate_comments tool. The function calls
-- moderate_comment for each id in turn, so a comment that cannot take the status (missing, deleted, a reply
-- under a parent that is not approved) raises and rolls back every comment of the batch, audit rows included.

create or replace function public.moderate_comments_batch(
  p_comment_ids uuid[],
  p_status text,
  p_reason text,
  p_actor_kind text,
  p_actor_user_id uuid,
  p_actor_label text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_comment_ids is null
    or cardinality(p_comment_ids) not between 1 and 25
    or cardinality(p_comment_ids) <> (select count(distinct comment_id) from unnest(p_comment_ids) as comment_id)
  then
    raise exception 'comment_moderation_invalid' using errcode = '22023';
  end if;

  foreach v_id in array p_comment_ids loop
    perform public.moderate_comment(v_id, p_status, p_reason, p_actor_kind, p_actor_user_id, p_actor_label);
  end loop;
end;
$$;

revoke all on function public.moderate_comments_batch(uuid[], text, text, text, uuid, text)
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.moderate_comments_batch(uuid[], text, text, text, uuid, text) to service_role';
  end if;
end;
$$;
