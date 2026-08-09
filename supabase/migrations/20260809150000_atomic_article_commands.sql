create or replace function public.save_article_with_distribution(
  p_id uuid,
  p_translation_key text,
  p_locale text,
  p_slug text,
  p_title text,
  p_excerpt text,
  p_content text,
  p_cover_image text,
  p_cover_alt text,
  p_status text,
  p_category_id uuid,
  p_author_id uuid,
  p_featured boolean,
  p_reading_minutes integer,
  p_published_at timestamptz,
  p_scheduled_for timestamptz,
  p_distribution text[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid;
  channel_name text;
begin
  if p_id is null then
    insert into public.articles (
      translation_key,
      locale,
      slug,
      title,
      excerpt,
      content,
      cover_image,
      cover_alt,
      status,
      category_id,
      author_id,
      featured,
      reading_minutes,
      published_at,
      scheduled_for
    )
    values (
      p_translation_key,
      p_locale,
      p_slug,
      p_title,
      p_excerpt,
      p_content,
      p_cover_image,
      p_cover_alt,
      p_status,
      p_category_id,
      p_author_id,
      p_featured,
      p_reading_minutes,
      p_published_at,
      p_scheduled_for
    )
    returning id into saved_id;
  else
    update public.articles set
      translation_key = p_translation_key,
      locale = p_locale,
      slug = p_slug,
      title = p_title,
      excerpt = p_excerpt,
      content = p_content,
      cover_image = p_cover_image,
      cover_alt = p_cover_alt,
      status = p_status,
      category_id = p_category_id,
      author_id = p_author_id,
      featured = p_featured,
      reading_minutes = p_reading_minutes,
      published_at = p_published_at,
      scheduled_for = p_scheduled_for
    where id = p_id
    returning id into saved_id;

    if saved_id is null then
      raise exception 'Article not found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.social_publications
  where article_id = saved_id
    and status <> 'published'
    and not (channel = any(coalesce(p_distribution, array[]::text[])));

  foreach channel_name in array coalesce(p_distribution, array[]::text[])
  loop
    insert into public.social_publications (article_id, channel, status)
    values (saved_id, channel_name, 'ready')
    on conflict (article_id, channel) do nothing;
  end loop;

  return saved_id;
end;
$$;

revoke all on function public.save_article_with_distribution(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid,
  uuid,
  boolean,
  integer,
  timestamptz,
  timestamptz,
  text[]
) from public;

grant execute on function public.save_article_with_distribution(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid,
  uuid,
  boolean,
  integer,
  timestamptz,
  timestamptz,
  text[]
) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute $grant$
      grant execute on function public.save_article_with_distribution(
        uuid, text, text, text, text, text, text, text, text, text,
        uuid, uuid, boolean, integer, timestamptz, timestamptz, text[]
      ) to service_role
    $grant$;
  end if;
end;
$$;
