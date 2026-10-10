-- Batch writes for stories, categories and entities. The admin MCP and Studio write up to 25 rows
-- per call; doing that with one request per row leaves a half-written batch when a later row fails.
-- Each function here is one statement for the caller, so a batch is one transaction: every item is
-- written or none is. A failing item re-raises as "Item <n>: <message>" with its original SQLSTATE.
--
-- The functions are security invoker: table privileges and row-level security still decide, and a
-- write that RLS filters out raises instead of reporting success. They hold no business logic beyond
-- three backstops: the batch size (25 mirrors the TypeScript domain constant), "in use" refusals on
-- delete, and the publication guard: save_articles_batch never changes whether a story is published,
-- only publish_articles_batch does.
--
-- anon is revoked by name because legacy Supabase default privileges grant EXECUTE on new functions.
-- service_role could only read public.categories; it now writes them for the category batches.

create or replace function public.content_batch_size_check(p_size integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(p_size, 0) not between 1 and 25 then
    raise exception 'A batch holds between 1 and 25 items' using errcode = '22023';
  end if;
end;
$$;

-- Items carry the parameters of save_article_with_distribution without the p_ prefix. A JSON null
-- and an absent key mean the same.
create or replace function public.save_articles_batch(p_items jsonb)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  item_index bigint;
  existing_status text;
  saved_ids uuid[] := array[]::uuid[];
begin
  perform public.content_batch_size_check(jsonb_array_length(p_items));

  for item, item_index in
    select jsonb_strip_nulls(value), ordinality
    from jsonb_array_elements(p_items) with ordinality
    order by ordinality
  loop
    begin
      existing_status := null;
      if item ? 'id' then
        -- Locked, so a concurrent publish cannot slip between this check and the save.
        select status into existing_status
        from public.articles
        where id = (item ->> 'id')::uuid
        for update;
        if not found then
          raise exception 'Article not found' using errcode = 'P0002';
        end if;
      end if;
      if (coalesce(item ->> 'status', '') = 'published')
        is distinct from (coalesce(existing_status, '') = 'published')
      then
        raise exception 'Saving cannot publish or unpublish an article; use publish_articles_batch'
          using errcode = '42501';
      end if;

      saved_ids := saved_ids || public.save_article_with_distribution(
        p_id => (item ->> 'id')::uuid,
        p_translation_key => item ->> 'translation_key',
        p_locale => item ->> 'locale',
        p_slug => item ->> 'slug',
        p_title => item ->> 'title',
        p_excerpt => item ->> 'excerpt',
        p_content => item ->> 'content',
        p_cover_image => item ->> 'cover_image',
        p_cover_alt => item ->> 'cover_alt',
        p_status => item ->> 'status',
        p_category_id => (item ->> 'category_id')::uuid,
        p_author_id => (item ->> 'author_id')::uuid,
        p_featured => (item ->> 'featured')::boolean,
        p_reading_minutes => (item ->> 'reading_minutes')::integer,
        p_published_at => (item ->> 'published_at')::timestamptz,
        p_scheduled_for => (item ->> 'scheduled_for')::timestamptz,
        p_distribution => array(select jsonb_array_elements_text(item -> 'distribution')),
        p_claim_status => item ->> 'claim_status',
        p_key_points => array(select jsonb_array_elements_text(item -> 'key_points')),
        p_sources => item -> 'sources',
        p_entities => item -> 'entities'
      );
    exception when others then
      raise exception 'Item %: %', item_index, sqlerrm using errcode = sqlstate;
    end;
  end loop;

  return saved_ids;
end;
$$;

-- Duplicate ids count once. An id that is missing, or that RLS hides from the caller, fails the batch.
create or replace function public.publish_articles_batch(p_ids uuid[], p_published boolean)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_ids uuid[];
  missing_id uuid;
begin
  perform public.content_batch_size_check(cardinality(p_ids));
  if p_published is null then
    raise exception 'p_published is required' using errcode = '22023';
  end if;

  select array_agg(id order by first_position) into target_ids
  from (
    select id, min(position) as first_position
    from unnest(p_ids) with ordinality as input(id, position)
    group by id
  ) as distinct_input;

  with updated as (
    update public.articles set
      status = case when p_published then 'published' else 'draft' end,
      published_at = case when p_published then coalesce(published_at, now()) else published_at end,
      scheduled_for = null
    where id = any(target_ids)
    returning id
  )
  select input.id into missing_id
  from unnest(target_ids) with ordinality as input(id, position)
  where not exists (select 1 from updated where updated.id = input.id)
  order by input.position
  limit 1;
  if found then
    raise exception 'Article % not found', missing_id using errcode = 'P0002';
  end if;

  return target_ids;
end;
$$;

create or replace function public.delete_articles_batch(p_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  missing_id uuid;
begin
  perform public.content_batch_size_check(cardinality(p_ids));

  with deleted as (
    delete from public.articles where id = any(p_ids) returning id
  )
  select input.id into missing_id
  from unnest(p_ids) with ordinality as input(id, position)
  where not exists (select 1 from deleted where deleted.id = input.id)
  order by input.position
  limit 1;
  if found then
    raise exception 'Article % not found', missing_id using errcode = 'P0002';
  end if;

  return (select count(distinct input.id) from unnest(p_ids) as input(id));
end;
$$;

-- Item: {"translation_key", "position", "translations": {"<locale>": {"slug", "name", "description"}}}.
create or replace function public.create_categories_batch(p_items jsonb)
returns text[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  item_index bigint;
  saved_keys text[] := array[]::text[];
begin
  perform public.content_batch_size_check(jsonb_array_length(p_items));

  for item, item_index in
    select jsonb_strip_nulls(value), ordinality
    from jsonb_array_elements(p_items) with ordinality
    order by ordinality
  loop
    begin
      insert into public.categories (translation_key, locale, slug, name, description, position)
      select
        item ->> 'translation_key',
        translation.key,
        translation.value ->> 'slug',
        translation.value ->> 'name',
        coalesce(translation.value ->> 'description', ''),
        (item ->> 'position')::integer
      from jsonb_each(item -> 'translations') as translation;
      if not found then
        raise exception 'A category needs at least one translation' using errcode = '22023';
      end if;
      saved_keys := saved_keys || (item ->> 'translation_key');
    exception when others then
      raise exception 'Item %: %', item_index, sqlerrm using errcode = sqlstate;
    end;
  end loop;

  return saved_keys;
end;
$$;

-- Same item as create, with the full values of every translation it names.
create or replace function public.update_categories_batch(p_items jsonb)
returns text[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  item_index bigint;
  translation record;
  saved_keys text[] := array[]::text[];
begin
  perform public.content_batch_size_check(jsonb_array_length(p_items));

  for item, item_index in
    select jsonb_strip_nulls(value), ordinality
    from jsonb_array_elements(p_items) with ordinality
    order by ordinality
  loop
    begin
      for translation in select key, value from jsonb_each(item -> 'translations')
      loop
        update public.categories set
          slug = translation.value ->> 'slug',
          name = translation.value ->> 'name',
          description = translation.value ->> 'description'
        where translation_key = item ->> 'translation_key'
          and locale = translation.key;
        if not found then
          raise exception 'Category "%" has no "%" translation', item ->> 'translation_key', translation.key
            using errcode = 'P0002';
        end if;
      end loop;

      update public.categories set position = (item ->> 'position')::integer
      where translation_key = item ->> 'translation_key';
      if not found then
        raise exception 'Category "%" not found', item ->> 'translation_key' using errcode = 'P0002';
      end if;
      saved_keys := saved_keys || (item ->> 'translation_key');
    exception when others then
      raise exception 'Item %: %', item_index, sqlerrm using errcode = sqlstate;
    end;
  end loop;

  return saved_keys;
end;
$$;

create or replace function public.delete_categories_batch(p_keys text[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  category_key text;
  item_index integer := 0;
  usage_count bigint;
begin
  perform public.content_batch_size_check(cardinality(p_keys));

  foreach category_key in array p_keys
  loop
    item_index := item_index + 1;
    begin
      select count(*) into usage_count
      from public.articles article
      join public.categories category on category.id = article.category_id
      where category.translation_key = category_key;
      if usage_count > 0 then
        raise exception 'Category "%" is used by % articles', category_key, usage_count
          using errcode = '23503';
      end if;

      delete from public.categories where translation_key = category_key;
      if not found then
        raise exception 'Category "%" not found', category_key using errcode = 'P0002';
      end if;
    exception when others then
      raise exception 'Item %: %', item_index, sqlerrm using errcode = sqlstate;
    end;
  end loop;

  return item_index;
end;
$$;

-- Item: {"kind", "slug", "name", "official_url", "parent_slug", "descriptions": {"<locale>": text}}.
-- The parent is looked up when its item is written, so it may be an earlier item of the same batch.
create or replace function public.create_entities_batch(p_items jsonb)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  item_index bigint;
  parent_entity_id uuid;
  saved_id uuid;
  saved_ids uuid[] := array[]::uuid[];
begin
  perform public.content_batch_size_check(jsonb_array_length(p_items));

  for item, item_index in
    select jsonb_strip_nulls(value), ordinality
    from jsonb_array_elements(p_items) with ordinality
    order by ordinality
  loop
    begin
      parent_entity_id := (select id from public.entities where slug = item ->> 'parent_slug');
      if item ? 'parent_slug' and parent_entity_id is null then
        raise exception 'Unknown parent entity %', item ->> 'parent_slug' using errcode = '22023';
      end if;

      insert into public.entities (kind, slug, name, official_url, parent_id)
      values (item ->> 'kind', item ->> 'slug', item ->> 'name', item ->> 'official_url', parent_entity_id)
      returning id into saved_id;

      insert into public.entity_descriptions (entity_id, locale, description)
      select saved_id, description.key, description.value
      from jsonb_each_text(item -> 'descriptions') as description;
      saved_ids := saved_ids || saved_id;
    exception when others then
      raise exception 'Item %: %', item_index, sqlerrm using errcode = sqlstate;
    end;
  end loop;

  return saved_ids;
end;
$$;

-- Same item as create, matched by slug, with full values: a null parent_slug clears the parent and
-- a locale absent from descriptions loses its description.
create or replace function public.update_entities_batch(p_items jsonb)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  item_index bigint;
  parent_entity_id uuid;
  saved_id uuid;
  saved_ids uuid[] := array[]::uuid[];
begin
  perform public.content_batch_size_check(jsonb_array_length(p_items));

  for item, item_index in
    select jsonb_strip_nulls(value), ordinality
    from jsonb_array_elements(p_items) with ordinality
    order by ordinality
  loop
    begin
      parent_entity_id := (select id from public.entities where slug = item ->> 'parent_slug');
      if item ? 'parent_slug' and parent_entity_id is null then
        raise exception 'Unknown parent entity %', item ->> 'parent_slug' using errcode = '22023';
      end if;

      update public.entities set
        kind = item ->> 'kind',
        name = item ->> 'name',
        official_url = item ->> 'official_url',
        parent_id = parent_entity_id
      where slug = item ->> 'slug'
      returning id into saved_id;
      if not found then
        raise exception 'Entity "%" not found', item ->> 'slug' using errcode = 'P0002';
      end if;

      delete from public.entity_descriptions
      where entity_id = saved_id
        and not (coalesce(item -> 'descriptions', '{}'::jsonb) ? locale);
      insert into public.entity_descriptions (entity_id, locale, description)
      select saved_id, description.key, description.value
      from jsonb_each_text(item -> 'descriptions') as description
      on conflict (entity_id, locale) do update set description = excluded.description;
      saved_ids := saved_ids || saved_id;
    exception when others then
      raise exception 'Item %: %', item_index, sqlerrm using errcode = sqlstate;
    end;
  end loop;

  return saved_ids;
end;
$$;

create or replace function public.delete_entities_batch(p_slugs text[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  entity_slug text;
  item_index integer := 0;
  target_id uuid;
  usage_count bigint;
begin
  perform public.content_batch_size_check(cardinality(p_slugs));

  foreach entity_slug in array p_slugs
  loop
    item_index := item_index + 1;
    begin
      select id into target_id from public.entities where slug = entity_slug;
      if not found then
        raise exception 'Entity "%" not found', entity_slug using errcode = 'P0002';
      end if;

      select count(*) into usage_count from public.article_entities where entity_id = target_id;
      if usage_count > 0 then
        raise exception 'Entity "%" is linked to % stories', entity_slug, usage_count
          using errcode = '23503';
      end if;
      select count(*) into usage_count from public.entities where parent_id = target_id;
      if usage_count > 0 then
        raise exception 'Entity "%" is the parent of % entities', entity_slug, usage_count
          using errcode = '23503';
      end if;

      delete from public.entities where id = target_id;
      if not found then
        raise exception 'Entity "%" not found', entity_slug using errcode = 'P0002';
      end if;
    exception when others then
      raise exception 'Item %: %', item_index, sqlerrm using errcode = sqlstate;
    end;
  end loop;

  return item_index;
end;
$$;

revoke all on function public.content_batch_size_check(integer) from public, anon;
revoke all on function public.save_articles_batch(jsonb) from public, anon;
revoke all on function public.publish_articles_batch(uuid[], boolean) from public, anon;
revoke all on function public.delete_articles_batch(uuid[]) from public, anon;
revoke all on function public.create_categories_batch(jsonb) from public, anon;
revoke all on function public.update_categories_batch(jsonb) from public, anon;
revoke all on function public.delete_categories_batch(text[]) from public, anon;
revoke all on function public.create_entities_batch(jsonb) from public, anon;
revoke all on function public.update_entities_batch(jsonb) from public, anon;
revoke all on function public.delete_entities_batch(text[]) from public, anon;

grant execute on function public.content_batch_size_check(integer) to authenticated;
grant execute on function public.save_articles_batch(jsonb) to authenticated;
grant execute on function public.publish_articles_batch(uuid[], boolean) to authenticated;
grant execute on function public.delete_articles_batch(uuid[]) to authenticated;
grant execute on function public.create_categories_batch(jsonb) to authenticated;
grant execute on function public.update_categories_batch(jsonb) to authenticated;
grant execute on function public.delete_categories_batch(text[]) to authenticated;
grant execute on function public.create_entities_batch(jsonb) to authenticated;
grant execute on function public.update_entities_batch(jsonb) to authenticated;
grant execute on function public.delete_entities_batch(text[]) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant insert, update, delete on public.categories to service_role;
    grant execute on function public.content_batch_size_check(integer) to service_role;
    grant execute on function public.save_articles_batch(jsonb) to service_role;
    grant execute on function public.publish_articles_batch(uuid[], boolean) to service_role;
    grant execute on function public.delete_articles_batch(uuid[]) to service_role;
    grant execute on function public.create_categories_batch(jsonb) to service_role;
    grant execute on function public.update_categories_batch(jsonb) to service_role;
    grant execute on function public.delete_categories_batch(text[]) to service_role;
    grant execute on function public.create_entities_batch(jsonb) to service_role;
    grant execute on function public.update_entities_batch(jsonb) to service_role;
    grant execute on function public.delete_entities_batch(text[]) to service_role;
  end if;
end;
$$;
