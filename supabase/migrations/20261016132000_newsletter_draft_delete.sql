-- Deleting a newsletter campaign that is still a draft, for admin_newsletter_delete_campaign_draft. A draft has no
-- recipients or outbox rows yet, so the row goes alone. Anything past draft stays as a record: the policy
-- only lets an editor delete drafts, and the service role reaches the same rule through the repository's filter.

grant delete on public.newsletter_campaigns to authenticated;

drop policy if exists newsletter_campaigns_editor_delete_draft on public.newsletter_campaigns;
create policy newsletter_campaigns_editor_delete_draft on public.newsletter_campaigns
  for delete to authenticated using ((select public.is_editor()) and status = 'draft');

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant delete on public.newsletter_campaigns to service_role';
  end if;
end;
$$;
