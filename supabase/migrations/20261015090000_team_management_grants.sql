-- Team management (an admin invites an editor, changes a role or removes them) runs with the
-- service-role key: the Auth admin API that sends the invitation needs it, and the same client writes
-- the two rows an editor consists of. Earlier migrations gave service_role read access to profiles and
-- authors only (the MCP editor directory). Add exactly what SupabaseEditorDirectory writes:
--   * insert an author (the name articles are attributed to) and a profile (the role) for an invitee;
--   * update the role of a profile;
--   * delete a profile to remove access, and the author of someone who wrote nothing (a foreign key
--     keeps an author that articles still use).
-- The Auth user is never deleted by a removal. Callers are authorized in the delivery layer (the
-- newsroom.admin scope and the Studio's admin check), because service_role bypasses RLS; anon and
-- authenticated are untouched and keep the admin-only profiles policies.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant insert, delete on public.authors to service_role;
    grant insert, update, delete on public.profiles to service_role;
  end if;
end;
$$;
