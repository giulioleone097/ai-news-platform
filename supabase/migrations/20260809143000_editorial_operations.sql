create index if not exists newsletter_subscriptions_locale_created_idx
  on public.newsletter_subscriptions (locale, created_at desc, id desc);

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
declare
  normalized_email text := lower(trim(p_email));
  normalized_source text := trim(p_source);
begin
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

  insert into public.newsletter_subscriptions (
    email,
    source,
    locale,
    status,
    consented_at,
    unsubscribed_at
  )
  values (
    normalized_email,
    normalized_source,
    p_locale,
    'active',
    now(),
    null
  )
  on conflict (email) do update set
    source = excluded.source,
    locale = excluded.locale
  where newsletter_subscriptions.status = 'active';
end;
$$;

revoke all on function public.subscribe_newsletter(text, text, text) from public;
grant execute on function public.subscribe_newsletter(text, text, text) to anon, authenticated;

revoke update on table public.newsletter_subscriptions from authenticated;
grant update (status, unsubscribed_at) on table public.newsletter_subscriptions to authenticated;

create or replace function public.is_editorial_media_referenced(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.articles
    where regexp_replace(cover_image, '[?#].*$', '') = p_name
      or right(
        regexp_replace(cover_image, '[?#].*$', ''),
        char_length('/storage/v1/object/public/editorial-media/' || p_name)
      ) = '/storage/v1/object/public/editorial-media/' || p_name
  );
$$;

revoke all on function public.is_editorial_media_referenced(text) from public;
grant execute on function public.is_editorial_media_referenced(text) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Supabase Storage is unavailable; skipping editorial-media bucket policies';
    return;
  end if;

  execute $sql$
    insert into storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    )
    values (
      'editorial-media',
      'editorial-media',
      true,
      8388608,
      array['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']
    )
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types
  $sql$;

  execute 'drop policy if exists editorial_media_public_read on storage.objects';
  execute $sql$
    create policy editorial_media_public_read on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'editorial-media')
  $sql$;

  execute 'drop policy if exists editorial_media_editor_insert on storage.objects';
  execute $sql$
    create policy editorial_media_editor_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'editorial-media'
        and (select public.is_editor())
      )
  $sql$;

  execute 'drop policy if exists editorial_media_editor_update on storage.objects';

  execute 'drop policy if exists editorial_media_editor_delete on storage.objects';
  execute $sql$
    create policy editorial_media_editor_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'editorial-media'
        and (select public.is_editor())
        and not (select public.is_editorial_media_referenced(name))
      )
  $sql$;
end;
$$;
