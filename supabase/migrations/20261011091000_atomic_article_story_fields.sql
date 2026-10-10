-- save_article_with_distribution now carries the story fields and the entity links, so one
-- save is one transaction. p_entities is a jsonb array of {"slug": text, "is_primary": boolean};
-- the links are replaced as a whole. The previous signature is dropped so it cannot be used
-- to bypass the new fields.

drop function if exists public.save_article_with_distribution(
  uuid, text, text, text, text, text, text, text, text, text,
  uuid, uuid, boolean, integer, timestamptz, timestamptz, text[]
);

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
  p_distribution text[],
  p_claim_status text,
  p_key_points text[],
  p_sources jsonb,
  p_entities jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid;
  channel_name text;
  link jsonb;
  linked_entity_id uuid;
  link_count integer := coalesce(jsonb_array_length(coalesce(p_entities, '[]'::jsonb)), 0);
begin
  if link_count > 8 then
    raise exception 'An article links at most 8 entities' using errcode = '22023';
  end if;
  if link_count > 0 and (
    select count(*) from jsonb_array_elements(p_entities) as item
    where coalesce((item ->> 'is_primary')::boolean, false)
  ) <> 1 then
    raise exception 'An article with entities needs exactly one primary entity' using errcode = '22023';
  end if;

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
      scheduled_for,
      claim_status,
      key_points,
      sources
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
      p_scheduled_for,
      p_claim_status,
      coalesce(p_key_points, array[]::text[]),
      coalesce(p_sources, '[]'::jsonb)
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
      scheduled_for = p_scheduled_for,
      claim_status = p_claim_status,
      key_points = coalesce(p_key_points, array[]::text[]),
      sources = coalesce(p_sources, '[]'::jsonb)
    where id = p_id
    returning id into saved_id;

    if saved_id is null then
      raise exception 'Article not found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.article_entities where article_id = saved_id;
  if link_count > 0 then
    for link in select value from jsonb_array_elements(p_entities)
    loop
      select id into linked_entity_id from public.entities where slug = link ->> 'slug';
      if linked_entity_id is null then
        raise exception 'Unknown entity %', link ->> 'slug' using errcode = '22023';
      end if;
      insert into public.article_entities (article_id, entity_id, is_primary)
      values (saved_id, linked_entity_id, coalesce((link ->> 'is_primary')::boolean, false));
    end loop;
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
  uuid, text, text, text, text, text, text, text, text, text,
  uuid, uuid, boolean, integer, timestamptz, timestamptz, text[],
  text, text[], jsonb, jsonb
) from public;

grant execute on function public.save_article_with_distribution(
  uuid, text, text, text, text, text, text, text, text, text,
  uuid, uuid, boolean, integer, timestamptz, timestamptz, text[],
  text, text[], jsonb, jsonb
) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute $grant$
      grant execute on function public.save_article_with_distribution(
        uuid, text, text, text, text, text, text, text, text, text,
        uuid, uuid, boolean, integer, timestamptz, timestamptz, text[],
        text, text[], jsonb, jsonb
      ) to service_role
    $grant$;
  end if;
end;
$$;
