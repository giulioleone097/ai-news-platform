create extension if not exists pgcrypto;

create table if not exists public.authors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  role text not null default 'Autore' check (char_length(role) between 2 and 80),
  initials text not null check (char_length(initials) between 1 and 4),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '',
  position smallint not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  author_id uuid not null references public.authors(id) on delete restrict,
  role text not null default 'editor' check (role in ('editor', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 8 and 180),
  excerpt text not null check (char_length(excerpt) between 20 and 360),
  content text not null check (char_length(content) >= 20),
  cover_image text not null default '/media/neura-agents-hero.png',
  cover_alt text not null check (char_length(cover_alt) between 3 and 240),
  status text not null default 'draft' check (status in ('draft', 'review', 'scheduled', 'published')),
  category_id uuid not null references public.categories(id) on delete restrict,
  author_id uuid not null references public.authors(id) on delete restrict,
  featured boolean not null default false,
  reading_minutes smallint not null default 1 check (reading_minutes between 1 and 180),
  published_at timestamptz,
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('italian', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('italian', coalesce(excerpt, '')), 'B') ||
    setweight(to_tsvector('italian', coalesce(content, '')), 'C')
  ) stored,
  constraint articles_publish_state_check check (
    (status = 'published' and published_at is not null)
    or status <> 'published'
  ),
  constraint articles_schedule_state_check check (
    (status = 'scheduled' and scheduled_for is not null)
    or status <> 'scheduled'
  )
);

create table if not exists public.social_publications (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  channel text not null check (channel in ('newsletter', 'linkedin', 'x', 'whatsapp')),
  status text not null default 'ready' check (status in ('draft', 'ready', 'published', 'failed')),
  message text,
  external_url text,
  scheduled_for timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (article_id, channel)
);

create table if not exists public.newsletter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null default 'site' check (char_length(source) between 2 and 80),
  status text not null default 'active' check (status in ('active', 'unsubscribed')),
  consented_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint newsletter_email_normalized unique (email),
  constraint newsletter_email_shape check (email = lower(trim(email)) and position('@' in email) > 1)
);

create index if not exists profiles_author_id_idx on public.profiles (author_id);
create index if not exists articles_author_id_idx on public.articles (author_id);
create index if not exists articles_category_id_idx on public.articles (category_id);
create index if not exists articles_status_published_idx
  on public.articles (status, published_at desc, id desc);
create index if not exists articles_category_status_published_idx
  on public.articles (category_id, status, published_at desc, id desc);
create index if not exists articles_scheduled_idx
  on public.articles (scheduled_for, id)
  where status = 'scheduled';
create index if not exists articles_search_idx on public.articles using gin (search_vector);
create index if not exists social_publications_article_id_idx
  on public.social_publications (article_id);
create index if not exists social_publications_ready_idx
  on public.social_publications (status, scheduled_for, id)
  where status = 'ready';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists articles_set_updated_at on public.articles;
create trigger articles_set_updated_at
before update on public.articles
for each row execute function public.set_updated_at();

drop trigger if exists social_publications_set_updated_at on public.social_publications;
create trigger social_publications_set_updated_at
before update on public.social_publications
for each row execute function public.set_updated_at();

create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('editor', 'admin')
  );
$$;

revoke all on function public.is_editor() from public;
grant execute on function public.is_editor() to authenticated;

alter table public.authors enable row level security;
alter table public.categories enable row level security;
alter table public.profiles enable row level security;
alter table public.articles enable row level security;
alter table public.social_publications enable row level security;
alter table public.newsletter_subscriptions enable row level security;

drop policy if exists authors_public_read on public.authors;
create policy authors_public_read on public.authors
  for select to anon, authenticated using (true);
drop policy if exists authors_editor_write on public.authors;
create policy authors_editor_write on public.authors
  for all to authenticated
  using ((select public.is_editor()))
  with check ((select public.is_editor()));

drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories
  for select to anon, authenticated using (true);
drop policy if exists categories_editor_write on public.categories;
create policy categories_editor_write on public.categories
  for all to authenticated
  using ((select public.is_editor()))
  with check ((select public.is_editor()));

drop policy if exists profiles_own_read on public.profiles;
create policy profiles_own_read on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_editor()));
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all to authenticated
  using ((select public.is_editor()))
  with check ((select public.is_editor()));

drop policy if exists articles_anon_read on public.articles;
create policy articles_anon_read on public.articles
  for select to anon
  using (status = 'published' and published_at <= now());
drop policy if exists articles_authenticated_read on public.articles;
create policy articles_authenticated_read on public.articles
  for select to authenticated
  using (
    (status = 'published' and published_at <= now())
    or (select public.is_editor())
  );
drop policy if exists articles_editor_insert on public.articles;
create policy articles_editor_insert on public.articles
  for insert to authenticated with check ((select public.is_editor()));
drop policy if exists articles_editor_update on public.articles;
create policy articles_editor_update on public.articles
  for update to authenticated
  using ((select public.is_editor()))
  with check ((select public.is_editor()));
drop policy if exists articles_editor_delete on public.articles;
create policy articles_editor_delete on public.articles
  for delete to authenticated using ((select public.is_editor()));

drop policy if exists social_editor_access on public.social_publications;
create policy social_editor_access on public.social_publications
  for all to authenticated
  using ((select public.is_editor()))
  with check ((select public.is_editor()));

drop policy if exists newsletter_public_subscribe on public.newsletter_subscriptions;
create policy newsletter_public_subscribe on public.newsletter_subscriptions
  for insert to anon, authenticated
  with check (position('@' in email) > 1 and status = 'active');
drop policy if exists newsletter_editor_read on public.newsletter_subscriptions;
create policy newsletter_editor_read on public.newsletter_subscriptions
  for select to authenticated using ((select public.is_editor()));
drop policy if exists newsletter_editor_update on public.newsletter_subscriptions;
create policy newsletter_editor_update on public.newsletter_subscriptions
  for update to authenticated
  using ((select public.is_editor()))
  with check ((select public.is_editor()));

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.authors, public.categories, public.articles to anon, authenticated;
grant insert on public.newsletter_subscriptions to anon, authenticated;
grant select, insert, update, delete on
  public.authors,
  public.categories,
  public.profiles,
  public.articles,
  public.social_publications,
  public.newsletter_subscriptions
to authenticated;
