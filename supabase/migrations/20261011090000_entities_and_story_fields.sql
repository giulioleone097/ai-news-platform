-- AtlasNews story model: the companies, models and products a story is about, and on each
-- article its claim status, up to three key points and the sources that back its claims.
-- Existing articles stay valid: every new column has a default.

create or replace function public.article_key_points_valid(p_points text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_points is not null
    and cardinality(p_points) <= 3
    and not exists (
      select 1
      from unnest(p_points) as point
      where point is null or char_length(btrim(point)) not between 3 and 140
    );
$$;

create or replace function public.article_sources_valid(p_sources jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_sources) <> 'array' then false
    when jsonb_array_length(p_sources) > 10 then false
    else not exists (
      select 1
      from jsonb_array_elements(p_sources) as source(item)
      where not coalesce(
        case when jsonb_typeof(source.item) = 'object' then
          (select count(*) from jsonb_object_keys(source.item)) = 3
          and jsonb_typeof(source.item -> 'title') = 'string'
          and char_length(btrim(source.item ->> 'title')) between 3 and 160
          and jsonb_typeof(source.item -> 'supports') = 'string'
          and char_length(btrim(source.item ->> 'supports')) between 3 and 240
          and jsonb_typeof(source.item -> 'url') = 'string'
          and char_length(source.item ->> 'url') <= 2048
          and (source.item ->> 'url') ~ '^https://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$'
        else false end,
        false
      )
    )
  end;
$$;

alter table public.articles
  add column if not exists claim_status text not null default 'analysis',
  add column if not exists key_points text[] not null default '{}',
  add column if not exists sources jsonb not null default '[]'::jsonb;

alter table public.articles
  drop constraint if exists articles_claim_status_check,
  drop constraint if exists articles_key_points_check,
  drop constraint if exists articles_sources_check;
alter table public.articles
  add constraint articles_claim_status_check
    check (claim_status in ('confirmed', 'rollout', 'test', 'rumour', 'analysis')),
  add constraint articles_key_points_check check (public.article_key_points_valid(key_points)),
  add constraint articles_sources_check check (public.article_sources_valid(sources));

create index if not exists articles_claim_status_published_idx
  on public.articles (locale, claim_status, published_at desc, id desc)
  where status = 'published';

create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('company', 'model', 'product')),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 96),
  name text not null check (char_length(name) between 1 and 120),
  official_url text
    check (official_url ~ '^https://[^[:space:]]+$' and char_length(official_url) <= 2048),
  parent_id uuid references public.entities(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entities_parent_check check (parent_id is null or kind <> 'company')
);

create table if not exists public.entity_descriptions (
  entity_id uuid not null references public.entities(id) on delete cascade,
  locale text not null check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  description text not null check (char_length(description) between 1 and 280),
  primary key (entity_id, locale)
);

create table if not exists public.article_entities (
  article_id uuid not null references public.articles(id) on delete cascade,
  entity_id uuid not null references public.entities(id) on delete restrict,
  is_primary boolean not null default false,
  primary key (article_id, entity_id)
);

create index if not exists entities_kind_name_idx on public.entities (kind, name);
create index if not exists entities_parent_id_idx on public.entities (parent_id)
  where parent_id is not null;
create index if not exists article_entities_entity_id_idx
  on public.article_entities (entity_id, article_id);
create unique index if not exists article_entities_one_primary_idx
  on public.article_entities (article_id)
  where is_primary;

-- Published stories per entity in one locale; security invoker, so row-level security
-- decides what the caller counts.
create or replace function public.entity_story_counts(p_locale text)
returns table (entity_id uuid, story_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select link.entity_id, count(*)
  from public.article_entities link
  join public.articles article on article.id = link.article_id
  where article.locale = p_locale
    and article.status = 'published'
    and article.published_at <= now()
  group by link.entity_id;
$$;

revoke all on function public.entity_story_counts(text) from public;
grant execute on function public.entity_story_counts(text) to anon, authenticated;

-- A model or a product belongs to a company, never to another model or product.
create or replace function public.check_entity_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null
    and not exists (
      select 1 from public.entities where id = new.parent_id and kind = 'company'
    )
  then
    raise exception 'The parent of an entity must be a company' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.kind <> 'company'
    and exists (select 1 from public.entities where parent_id = new.id)
  then
    raise exception 'A company with models or products stays a company' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists entities_check_parent on public.entities;
create trigger entities_check_parent
before insert or update of parent_id, kind on public.entities
for each row execute function public.check_entity_parent();

drop trigger if exists entities_set_updated_at on public.entities;
create trigger entities_set_updated_at
before update on public.entities
for each row execute function public.set_updated_at();

alter table public.entities enable row level security;
alter table public.entity_descriptions enable row level security;
alter table public.article_entities enable row level security;

drop policy if exists entities_public_read on public.entities;
create policy entities_public_read on public.entities
  for select to anon, authenticated using (true);
drop policy if exists entities_editor_write on public.entities;
create policy entities_editor_write on public.entities
  for all to authenticated
  using ((select public.is_editor()))
  with check ((select public.is_editor()));

drop policy if exists entity_descriptions_public_read on public.entity_descriptions;
create policy entity_descriptions_public_read on public.entity_descriptions
  for select to anon, authenticated using (true);
drop policy if exists entity_descriptions_editor_write on public.entity_descriptions;
create policy entity_descriptions_editor_write on public.entity_descriptions
  for all to authenticated
  using ((select public.is_editor()))
  with check ((select public.is_editor()));

-- The public sees the links of published stories only; editors see and write all of them.
drop policy if exists article_entities_anon_read on public.article_entities;
create policy article_entities_anon_read on public.article_entities
  for select to anon
  using (
    exists (
      select 1 from public.articles article
      where article.id = article_entities.article_id
        and article.status = 'published'
        and article.published_at <= now()
    )
  );
drop policy if exists article_entities_authenticated_read on public.article_entities;
create policy article_entities_authenticated_read on public.article_entities
  for select to authenticated
  using (
    exists (
      select 1 from public.articles article
      where article.id = article_entities.article_id
        and article.status = 'published'
        and article.published_at <= now()
    )
  );
drop policy if exists article_entities_editor_write on public.article_entities;
create policy article_entities_editor_write on public.article_entities
  for all to authenticated
  using ((select public.is_editor()))
  with check ((select public.is_editor()));

revoke all on table public.entities, public.entity_descriptions, public.article_entities
  from public, anon, authenticated;
grant select on public.entities, public.entity_descriptions, public.article_entities
  to anon, authenticated;
grant insert, update, delete on public.entities, public.entity_descriptions, public.article_entities
  to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete
      on public.entities, public.entity_descriptions, public.article_entities
      to service_role;
    grant execute on function public.entity_story_counts(text) to service_role;
  end if;
end;
$$;
