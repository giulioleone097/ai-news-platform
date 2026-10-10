-- SECURITY DEFINER functions in public run with the owner's rights, so who may execute them is the
-- security boundary. Earlier migrations revoked EXECUTE only from PUBLIC for most of the comment,
-- newsletter and notification functions. That is enough on a stack whose default privileges do not
-- grant EXECUTE to anon and authenticated, and not enough on one that does (Supabase projects created
-- with the original Data API defaults, and any function created from the dashboard SQL editor): there
-- anon could call moderate_comment (approve, reject or delete any comment, actor kind "system"),
-- claim_comment_notifications (returns recipient emails) and the rest through /rest/v1/rpc.
--
-- The app calls all of these with the service-role key (comments, newsletter delivery, social outbox,
-- MCP events), so this migration:
--   1. revokes EXECUTE from PUBLIC, anon and authenticated on every SECURITY DEFINER function in public;
--   2. re-grants only what a signed-in or anonymous role really needs:
--        authenticated  is_editor, is_admin (RLS policies), is_editorial_media_referenced (Studio media
--                       check), queue_newsletter_campaign, cancel_newsletter_campaign,
--                       admin_unsubscribe_newsletter_subscription (Studio, guarded by is_editor inside)
--        anon, authenticated  comment_parent_is_approved (used by the comments RLS policy)
--      service_role keeps the grants the earlier migrations gave it;
--   3. changes the default privileges of the migration role, so a function created later is not
--      executable by PUBLIC, anon or authenticated until a migration grants it on purpose. Functions
--      that RLS policies, CHECK constraints or column defaults call need that explicit grant.
--
-- Invoker functions keep their explicit grants (list_approved_comments, entity_story_counts,
-- save_article_with_distribution, update_distribution_publication, constraint helpers): they run with
-- the caller's rights, so table privileges and RLS still decide.

do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prosecdef
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end;
$$;

grant execute on function public.is_editor() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_editorial_media_referenced(text) to authenticated;
grant execute on function public.queue_newsletter_campaign(uuid, timestamptz) to authenticated;
grant execute on function public.cancel_newsletter_campaign(uuid) to authenticated;
grant execute on function public.admin_unsubscribe_newsletter_subscription(uuid) to authenticated;
grant execute on function public.comment_parent_is_approved(uuid) to anon, authenticated;

-- Default privileges. The first statement removes the implicit PUBLIC grant for functions this role
-- creates (extension functions are not affected), the second removes the explicit grants that legacy
-- Supabase defaults add in public. The supabase_admin statement covers functions created from the
-- dashboard; the migration role may not be allowed to change another role's defaults, so a refusal is
-- not an error.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

do $$
begin
  alter default privileges for role supabase_admin in schema public
    revoke execute on functions from anon, authenticated;
exception
  when insufficient_privilege or undefined_object then
    null;
end;
$$;
