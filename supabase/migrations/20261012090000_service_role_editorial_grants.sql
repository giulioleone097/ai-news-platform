-- The admin MCP and the workers read and write the editorial tables with the service-role key.
-- The initial schema revoked every table privilege from anon and authenticated but never granted
-- service_role anything, relying on the platform's default privileges. Newer Supabase stacks (and
-- projects created with the explicit Data API grants setting) no longer grant those by default,
-- so service_role got "permission denied for table categories" (and articles, authors,
-- social_publications, profiles). Grant exactly what the service-role callers need and nothing more:
--   * SupabaseEditorialRepository (admin MCP): read authors/categories, read and write articles and
--     social_publications, and the media-reference check;
--   * the MCP editor directory (apps/mcp auth/editors.ts): read profiles to map a signed-in user to an
--     author and a role. Read only; profile management stays with admins through RLS.
--
-- service_role bypasses RLS, so these grants add no policy; anon and authenticated are untouched.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on public.authors, public.categories, public.profiles to service_role;
    grant select, insert, update, delete on public.articles, public.social_publications to service_role;
    grant execute on function public.is_editorial_media_referenced(text) to service_role;
  end if;
end;
$$;
