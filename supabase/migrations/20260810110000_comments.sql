create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'articles_id_locale_key'
      and conrelid = 'public.articles'::regclass
  ) then
    alter table public.articles
      add constraint articles_id_locale_key unique (id, locale);
  end if;
end;
$$;

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null,
  locale text not null check (locale in ('en', 'it')),
  parent_id uuid references public.comments(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 4000),
  author_display_name text not null check (char_length(author_display_name) between 2 and 60),
  author_kind text not null check (author_kind in ('authenticated', 'guest')),
  author_user_id uuid,
  guest_identity_hash text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'spam', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint comments_article_locale_fkey foreign key (article_id, locale)
    references public.articles(id, locale) on delete cascade,
  constraint comments_actor_shape_check check (
    (author_kind = 'authenticated' and author_user_id is not null and guest_identity_hash is null)
    or
    (author_kind = 'guest' and author_user_id is null and guest_identity_hash ~ '^[0-9a-f]{64}$')
  ),
  constraint comments_deleted_state_check check (
    (status = 'deleted' and deleted_at is not null)
    or status <> 'deleted'
  )
);

create table if not exists public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  reporter_kind text not null check (reporter_kind in ('authenticated', 'guest')),
  reporter_user_id uuid,
  reporter_guest_identity_hash text,
  reason text not null
    check (reason in ('spam', 'harassment', 'hate', 'misinformation', 'privacy', 'other')),
  details text check (details is null or char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  constraint comment_reports_actor_shape_check check (
    (reporter_kind = 'authenticated' and reporter_user_id is not null and reporter_guest_identity_hash is null)
    or
    (reporter_kind = 'guest' and reporter_user_id is null and reporter_guest_identity_hash ~ '^[0-9a-f]{64}$')
  )
);

create table if not exists public.comment_moderation_audit (
  id bigint generated always as identity primary key,
  comment_id uuid references public.comments(id) on delete set null,
  action text not null check (
    action in (
      'created', 'edited', 'owner_deleted', 'reported',
      'approved', 'rejected', 'marked_spam', 'moderator_deleted'
    )
  ),
  actor_kind text not null check (actor_kind in ('authenticated', 'guest', 'moderator', 'system')),
  actor_user_id uuid,
  actor_label text check (actor_label is null or char_length(actor_label) between 2 and 80),
  previous_status text check (
    previous_status is null
    or previous_status in ('pending', 'approved', 'rejected', 'spam', 'deleted')
  ),
  next_status text check (
    next_status is null
    or next_status in ('pending', 'approved', 'rejected', 'spam', 'deleted')
  ),
  reason text check (reason is null or char_length(reason) <= 500),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.comment_rate_limits (
  identity_hash text not null check (identity_hash ~ '^[0-9a-f]{64}$'),
  action text not null check (action ~ '^[a-z_]{2,40}$'),
  window_started_at timestamptz not null,
  hits integer not null default 1 check (hits > 0),
  expires_at timestamptz not null,
  primary key (identity_hash, action, window_started_at)
);

create table if not exists public.comment_notification_subscriptions (
  id uuid primary key,
  comment_id uuid not null unique references public.comments(id) on delete cascade,
  email text not null check (
    email = lower(trim(email))
    and char_length(email) <= 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  verification_token_hash text not null check (verification_token_hash ~ '^[0-9a-f]{64}$'),
  verification_expires_at timestamptz not null,
  verified_at timestamptz,
  notify_on_replies boolean not null default true,
  notify_on_moderation boolean not null default true,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comment_notification_preference_check check (
    notify_on_replies or notify_on_moderation
  )
);

create table if not exists public.comment_notifications (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null
    references public.comment_notification_subscriptions(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete set null,
  kind text not null check (kind in ('verification', 'reply', 'moderation')),
  recipient_email text not null check (char_length(recipient_email) <= 254),
  recipient_email_hash text not null check (recipient_email_hash ~ '^[0-9a-f]{64}$'),
  locale text not null check (locale in ('en', 'it')),
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique check (char_length(dedupe_key) between 8 and 180),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts smallint not null default 0 check (attempts between 0 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  worker_id text check (worker_id is null or char_length(worker_id) between 2 and 100),
  dispatch_started_at timestamptz,
  provider_message_id text,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists comments_public_roots_idx
  on public.comments (article_id, locale, created_at desc, id desc)
  where status = 'approved' and parent_id is null;
create index if not exists comments_public_replies_idx
  on public.comments (parent_id, created_at desc, id desc)
  where status = 'approved' and parent_id is not null;
create index if not exists comments_moderation_queue_idx
  on public.comments (status, created_at desc, id desc)
  where status in ('pending', 'rejected', 'spam');
create index if not exists comments_article_id_idx on public.comments (article_id);
create index if not exists comments_parent_id_idx on public.comments (parent_id)
  where parent_id is not null;
create index if not exists comments_author_user_id_idx on public.comments (author_user_id)
  where author_user_id is not null;
create index if not exists comments_guest_identity_idx on public.comments (guest_identity_hash)
  where guest_identity_hash is not null;
create index if not exists comments_authenticated_owner_feed_idx
  on public.comments (
    author_user_id,
    article_id,
    locale,
    parent_id,
    created_at desc,
    id desc
  )
  where author_user_id is not null and status in ('pending', 'approved', 'rejected');
create index if not exists comments_guest_owner_feed_idx
  on public.comments (
    guest_identity_hash,
    article_id,
    locale,
    parent_id,
    created_at desc,
    id desc
  )
  where guest_identity_hash is not null and status in ('pending', 'approved', 'rejected');
create unique index if not exists comment_reports_user_once_idx
  on public.comment_reports (comment_id, reporter_user_id)
  where reporter_user_id is not null;
create unique index if not exists comment_reports_guest_once_idx
  on public.comment_reports (comment_id, reporter_guest_identity_hash)
  where reporter_guest_identity_hash is not null;
create index if not exists comment_reports_comment_status_idx
  on public.comment_reports (comment_id, status, created_at desc);
create index if not exists comment_audit_comment_id_idx
  on public.comment_moderation_audit (comment_id, id desc);
create index if not exists comment_rate_limits_expiry_idx
  on public.comment_rate_limits (expires_at);
create index if not exists comment_notification_email_hash_idx
  on public.comment_notification_subscriptions (email_hash);
create index if not exists comment_notifications_delivery_idx
  on public.comment_notifications (available_at, created_at, id)
  where status in ('pending', 'failed', 'processing');

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

drop trigger if exists comment_notification_subscriptions_set_updated_at
  on public.comment_notification_subscriptions;
create trigger comment_notification_subscriptions_set_updated_at
before update on public.comment_notification_subscriptions
for each row execute function public.set_updated_at();

create or replace function public.enforce_comment_parent_depth()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_article_id uuid;
  parent_locale text;
  grandparent_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select article_id, locale, parent_id
  into parent_article_id, parent_locale, grandparent_id
  from public.comments
  where id = new.parent_id;

  if not found
    or grandparent_id is not null
    or parent_article_id <> new.article_id
    or parent_locale <> new.locale
  then
    raise exception 'comment_parent_invalid' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists comments_enforce_parent_depth on public.comments;
create trigger comments_enforce_parent_depth
before insert or update of parent_id, article_id, locale on public.comments
for each row execute function public.enforce_comment_parent_depth();

create or replace function public.take_comment_rate_limit(
  p_identity_hash text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rate_now timestamptz := clock_timestamp();
  bucket timestamptz;
  current_hits integer;
begin
  if p_identity_hash !~ '^[0-9a-f]{64}$'
    or p_action !~ '^[a-z_]{2,40}$'
    or p_limit not between 1 and 1000
    or p_window_seconds not between 10 and 86400
  then
    raise exception 'comment_rate_limit_invalid' using errcode = '22023';
  end if;

  bucket := to_timestamp(
    floor(extract(epoch from rate_now) / p_window_seconds) * p_window_seconds
  );

  delete from public.comment_rate_limits
  where ctid in (
    select expired.ctid
    from public.comment_rate_limits expired
    where expired.expires_at < rate_now - interval '1 day'
    order by expired.expires_at
    limit 50
  );

  insert into public.comment_rate_limits (
    identity_hash,
    action,
    window_started_at,
    hits,
    expires_at
  )
  values (
    p_identity_hash,
    p_action,
    bucket,
    1,
    bucket + make_interval(secs => p_window_seconds)
  )
  on conflict (identity_hash, action, window_started_at)
  do update set hits = public.comment_rate_limits.hits + 1
  where public.comment_rate_limits.hits < p_limit
  returning hits into current_hits;

  if current_hits is null then
    raise exception 'comment_rate_limited' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.take_comment_rate_limit(text, text, integer, integer) from public;

create or replace function public.comment_parent_is_approved(p_parent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_parent_id is null or exists (
    select 1
    from public.comments parent
    where parent.id = p_parent_id
      and parent.status = 'approved'
  );
$$;

revoke all on function public.comment_parent_is_approved(uuid) from public;
grant execute on function public.comment_parent_is_approved(uuid) to anon, authenticated;

create or replace function public.list_approved_comments(
  p_article_id uuid,
  p_locale text,
  p_parent_id uuid,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_limit integer
)
returns table (
  id uuid,
  article_id uuid,
  locale text,
  parent_id uuid,
  body text,
  author_display_name text,
  created_at timestamptz,
  edited_at timestamptz,
  reply_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    comment.id,
    comment.article_id,
    comment.locale,
    comment.parent_id,
    comment.body,
    comment.author_display_name,
    comment.created_at,
    comment.edited_at,
    case
      when comment.parent_id is null then (
        select count(*)
        from public.comments reply
        where reply.parent_id = comment.id
          and reply.status = 'approved'
      )
      else 0
    end as reply_count
  from public.comments comment
  where comment.article_id = p_article_id
    and comment.locale = p_locale
    and comment.status = 'approved'
    and public.comment_parent_is_approved(comment.parent_id)
    and comment.parent_id is not distinct from p_parent_id
    and (
      p_cursor_created_at is null
      or (
        p_cursor_id is not null
        and (comment.created_at, comment.id) < (p_cursor_created_at, p_cursor_id)
      )
    )
  order by comment.created_at desc, comment.id desc
  limit least(greatest(coalesce(p_limit, 13), 1), 25);
$$;

revoke all on function public.list_approved_comments(
  uuid, text, uuid, timestamptz, uuid, integer
) from public;
grant execute on function public.list_approved_comments(
  uuid, text, uuid, timestamptz, uuid, integer
) to anon, authenticated;

create or replace function public.list_own_comments(
  p_article_id uuid,
  p_locale text,
  p_parent_id uuid,
  p_actor_kind text,
  p_actor_user_id uuid,
  p_guest_identity_hash text,
  p_owner_guest_identity_hash text,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_limit integer
)
returns table (
  id uuid,
  article_id uuid,
  locale text,
  parent_id uuid,
  body text,
  author_display_name text,
  created_at timestamptz,
  edited_at timestamptz,
  reply_count bigint,
  status text,
  edit_until timestamptz,
  delete_until timestamptz,
  can_edit boolean,
  can_delete boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_locale not in ('en', 'it')
    or not (
      (
        p_actor_kind = 'authenticated'
        and p_actor_user_id is not null
        and p_guest_identity_hash is null
        and (
          p_owner_guest_identity_hash is null
          or p_owner_guest_identity_hash ~ '^[0-9a-f]{64}$'
        )
      )
      or (
        p_actor_kind = 'guest'
        and p_actor_user_id is null
        and p_guest_identity_hash ~ '^[0-9a-f]{64}$'
        and p_owner_guest_identity_hash = p_guest_identity_hash
      )
    )
  then
    raise exception 'comment_actor_invalid' using errcode = '22023';
  end if;

  return query
  select
    comment.id,
    comment.article_id,
    comment.locale,
    comment.parent_id,
    comment.body,
    comment.author_display_name,
    comment.created_at,
    comment.edited_at,
    case
      when comment.parent_id is null then (
        select count(*)
        from public.comments reply
        where reply.parent_id = comment.id
          and reply.status = 'approved'
      )
      else 0
    end as reply_count,
    comment.status,
    comment.created_at + interval '15 minutes' as edit_until,
    comment.created_at + interval '24 hours' as delete_until,
    (
      comment.status in ('pending', 'approved')
      and statement_timestamp() <= comment.created_at + interval '15 minutes'
    ) as can_edit,
    (
      comment.status in ('pending', 'approved')
      and statement_timestamp() <= comment.created_at + interval '24 hours'
    ) as can_delete
  from public.comments comment
  where comment.article_id = p_article_id
    and comment.locale = p_locale
    and comment.parent_id is not distinct from p_parent_id
    and comment.status in ('pending', 'approved', 'rejected')
    and (
      (
        p_actor_kind = 'authenticated'
        and comment.author_kind = 'authenticated'
        and comment.author_user_id = p_actor_user_id
      )
      or (
        comment.author_kind = 'guest'
        and comment.guest_identity_hash = p_owner_guest_identity_hash
      )
    )
    and (
      p_cursor_created_at is null
      or (
        p_cursor_id is not null
        and (comment.created_at, comment.id) < (p_cursor_created_at, p_cursor_id)
      )
    )
  order by comment.created_at desc, comment.id desc
  limit least(greatest(coalesce(p_limit, 13), 1), 25);
end;
$$;

revoke all on function public.list_own_comments(
  uuid, text, uuid, text, uuid, text, text, timestamptz, uuid, integer
) from public;

create or replace function public.create_comment(
  p_article_id uuid,
  p_locale text,
  p_parent_id uuid,
  p_body text,
  p_author_display_name text,
  p_actor_kind text,
  p_actor_user_id uuid,
  p_guest_identity_hash text,
  p_actor_rate_hash text,
  p_network_rate_hash text,
  p_notification_subscription_id uuid,
  p_notification_email text,
  p_notification_email_hash text,
  p_notification_on_replies boolean,
  p_notification_on_moderation boolean,
  p_notification_token_hash text
)
returns table (
  id uuid,
  parent_id uuid,
  body text,
  author_display_name text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.comments%rowtype;
  normalized_body text := trim(p_body);
  normalized_name text := trim(p_author_display_name);
  normalized_email text := lower(trim(p_notification_email));
begin
  if p_locale not in ('en', 'it')
    or char_length(normalized_body) not between 2 and 4000
    or char_length(normalized_name) not between 2 and 60
  then
    raise exception 'comment_input_invalid' using errcode = '22023';
  end if;
  if not (
    (p_actor_kind = 'authenticated' and p_actor_user_id is not null and p_guest_identity_hash is null)
    or
    (p_actor_kind = 'guest' and p_actor_user_id is null and p_guest_identity_hash ~ '^[0-9a-f]{64}$')
  ) then
    raise exception 'comment_actor_invalid' using errcode = '22023';
  end if;
  if p_actor_rate_hash !~ '^[0-9a-f]{64}$' or p_network_rate_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'comment_rate_identity_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.articles article
    where article.id = p_article_id
      and article.locale = p_locale
      and article.status = 'published'
      and article.published_at <= now()
  ) then
    raise exception 'comment_not_found' using errcode = 'P0002';
  end if;
  if p_parent_id is not null and not exists (
    select 1
    from public.comments parent
    where parent.id = p_parent_id
      and parent.article_id = p_article_id
      and parent.locale = p_locale
      and parent.parent_id is null
      and parent.status = 'approved'
  ) then
    raise exception 'comment_parent_invalid' using errcode = '22023';
  end if;

  perform public.take_comment_rate_limit(p_actor_rate_hash, 'create_actor', 5, 600);
  perform public.take_comment_rate_limit(p_network_rate_hash, 'create_network', 30, 600);

  insert into public.comments (
    article_id,
    locale,
    parent_id,
    body,
    author_display_name,
    author_kind,
    author_user_id,
    guest_identity_hash,
    status
  )
  values (
    p_article_id,
    p_locale,
    p_parent_id,
    normalized_body,
    normalized_name,
    p_actor_kind,
    p_actor_user_id,
    p_guest_identity_hash,
    'pending'
  )
  returning * into saved;

  insert into public.comment_moderation_audit (
    comment_id, action, actor_kind, actor_user_id, previous_status, next_status
  )
  values (saved.id, 'created', p_actor_kind, p_actor_user_id, null, 'pending');

  if p_notification_subscription_id is not null then
    if char_length(normalized_email) > 254
      or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or p_notification_email_hash !~ '^[0-9a-f]{64}$'
      or p_notification_token_hash !~ '^[0-9a-f]{64}$'
      or not (coalesce(p_notification_on_replies, false) or coalesce(p_notification_on_moderation, false))
    then
      raise exception 'comment_notification_invalid' using errcode = '22023';
    end if;

    insert into public.comment_notification_subscriptions (
      id,
      comment_id,
      email,
      email_hash,
      verification_token_hash,
      verification_expires_at,
      notify_on_replies,
      notify_on_moderation
    )
    values (
      p_notification_subscription_id,
      saved.id,
      normalized_email,
      p_notification_email_hash,
      p_notification_token_hash,
      now() + interval '24 hours',
      case when p_parent_id is null then p_notification_on_replies else false end,
      p_notification_on_moderation
    );

    insert into public.comment_notifications (
      subscription_id,
      comment_id,
      kind,
      recipient_email,
      recipient_email_hash,
      locale,
      payload,
      dedupe_key
    )
    values (
      p_notification_subscription_id,
      saved.id,
      'verification',
      normalized_email,
      p_notification_email_hash,
      p_locale,
      jsonb_build_object(
        'subscriptionId', p_notification_subscription_id,
        'commentId', saved.id,
        'articleSlug', (select article.slug from public.articles article where article.id = saved.article_id),
        'locale', p_locale
      ),
      'comment-verification:' || p_notification_subscription_id::text
    );
  end if;

  return query select
    saved.id,
    saved.parent_id,
    saved.body,
    saved.author_display_name,
    saved.status,
    saved.created_at;
end;
$$;

create or replace function public.edit_own_comment(
  p_comment_id uuid,
  p_body text,
  p_author_display_name text,
  p_actor_kind text,
  p_actor_user_id uuid,
  p_guest_identity_hash text,
  p_owner_guest_identity_hash text,
  p_actor_rate_hash text,
  p_network_rate_hash text
)
returns table (
  id uuid,
  parent_id uuid,
  body text,
  author_display_name text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_comment public.comments%rowtype;
  previous_status text;
  normalized_body text := trim(p_body);
  normalized_name text := trim(p_author_display_name);
begin
  if char_length(normalized_body) not between 2 and 4000
    or char_length(normalized_name) not between 2 and 60
  then
    raise exception 'comment_input_invalid' using errcode = '22023';
  end if;

  select * into current_comment
  from public.comments
  where comments.id = p_comment_id
  for update;

  if not found then
    raise exception 'comment_not_found' using errcode = 'P0002';
  end if;
  if not (
    (p_actor_kind = 'authenticated' and current_comment.author_kind = 'authenticated'
      and current_comment.author_user_id = p_actor_user_id)
    or (current_comment.author_kind = 'guest'
      and current_comment.guest_identity_hash = p_owner_guest_identity_hash)
  )
    or current_comment.status not in ('pending', 'approved')
    or clock_timestamp() > current_comment.created_at + interval '15 minutes'
  then
    raise exception 'comment_operation_not_allowed' using errcode = '42501';
  end if;

  perform public.take_comment_rate_limit(p_actor_rate_hash, 'edit_actor', 10, 3600);
  perform public.take_comment_rate_limit(p_network_rate_hash, 'edit_network', 40, 3600);
  previous_status := current_comment.status;

  update public.comments set
    body = normalized_body,
    author_display_name = normalized_name,
    status = 'pending',
    edited_at = now()
  where comments.id = p_comment_id
  returning * into current_comment;

  insert into public.comment_moderation_audit (
    comment_id, action, actor_kind, actor_user_id, previous_status, next_status
  )
  values (
    current_comment.id,
    'edited',
    p_actor_kind,
    p_actor_user_id,
    previous_status,
    'pending'
  );

  return query select
    current_comment.id,
    current_comment.parent_id,
    current_comment.body,
    current_comment.author_display_name,
    current_comment.status,
    current_comment.created_at;
end;
$$;

create or replace function public.delete_own_comment(
  p_comment_id uuid,
  p_actor_kind text,
  p_actor_user_id uuid,
  p_guest_identity_hash text,
  p_owner_guest_identity_hash text,
  p_actor_rate_hash text,
  p_network_rate_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_comment public.comments%rowtype;
  previous_status text;
begin
  select * into current_comment
  from public.comments
  where comments.id = p_comment_id
  for update;

  if not found then
    raise exception 'comment_not_found' using errcode = 'P0002';
  end if;
  if not (
    (p_actor_kind = 'authenticated' and current_comment.author_kind = 'authenticated'
      and current_comment.author_user_id = p_actor_user_id)
    or (current_comment.author_kind = 'guest'
      and current_comment.guest_identity_hash = p_owner_guest_identity_hash)
  )
    or current_comment.status not in ('pending', 'approved')
    or clock_timestamp() > current_comment.created_at + interval '24 hours'
  then
    raise exception 'comment_operation_not_allowed' using errcode = '42501';
  end if;

  perform public.take_comment_rate_limit(p_actor_rate_hash, 'delete_actor', 10, 3600);
  perform public.take_comment_rate_limit(p_network_rate_hash, 'delete_network', 40, 3600);
  previous_status := current_comment.status;

  update public.comments set
    body = '[deleted]',
    author_display_name = 'Deleted user',
    status = 'deleted',
    deleted_at = now()
  where comments.id = p_comment_id;

  update public.comment_notification_subscriptions set unsubscribed_at = now()
  where comment_id = p_comment_id and unsubscribed_at is null;

  update public.comment_notifications notification set
    status = 'cancelled',
    processed_at = now(),
    locked_at = null,
    worker_id = null
  from public.comment_notification_subscriptions subscription
  where subscription.comment_id = p_comment_id
    and notification.subscription_id = subscription.id
    and notification.status in ('pending', 'failed', 'processing')
    and notification.dispatch_started_at is null;

  insert into public.comment_moderation_audit (
    comment_id, action, actor_kind, actor_user_id, previous_status, next_status
  )
  values (
    p_comment_id,
    'owner_deleted',
    p_actor_kind,
    p_actor_user_id,
    previous_status,
    'deleted'
  );
end;
$$;

create or replace function public.report_comment(
  p_comment_id uuid,
  p_reason text,
  p_details text,
  p_actor_kind text,
  p_actor_user_id uuid,
  p_guest_identity_hash text,
  p_owner_guest_identity_hash text,
  p_actor_rate_hash text,
  p_network_rate_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.comments%rowtype;
begin
  if p_reason not in ('spam', 'harassment', 'hate', 'misinformation', 'privacy', 'other')
    or char_length(coalesce(trim(p_details), '')) > 500
  then
    raise exception 'comment_report_invalid' using errcode = '22023';
  end if;

  select * into target
  from public.comments
  where comments.id = p_comment_id
    and comments.status = 'approved';
  if not found then
    raise exception 'comment_not_found' using errcode = 'P0002';
  end if;
  if (p_actor_kind = 'authenticated' and target.author_user_id = p_actor_user_id)
    or (target.author_kind = 'guest' and target.guest_identity_hash = p_owner_guest_identity_hash)
  then
    raise exception 'comment_operation_not_allowed' using errcode = '42501';
  end if;

  perform public.take_comment_rate_limit(p_actor_rate_hash, 'report_actor', 10, 3600);
  perform public.take_comment_rate_limit(p_network_rate_hash, 'report_network', 50, 3600);

  begin
    insert into public.comment_reports (
      comment_id,
      reporter_kind,
      reporter_user_id,
      reporter_guest_identity_hash,
      reason,
      details
    )
    values (
      p_comment_id,
      p_actor_kind,
      p_actor_user_id,
      p_guest_identity_hash,
      p_reason,
      nullif(trim(p_details), '')
    );
  exception when unique_violation then
    raise exception 'comment_already_reported' using errcode = 'P0001';
  end;

  insert into public.comment_moderation_audit (
    comment_id, action, actor_kind, actor_user_id, previous_status, next_status, reason
  )
  values (
    p_comment_id, 'reported', p_actor_kind, p_actor_user_id, 'approved', 'approved', p_reason
  );
end;
$$;

create or replace function public.moderate_comment(
  p_comment_id uuid,
  p_status text,
  p_reason text,
  p_actor_kind text,
  p_actor_user_id uuid,
  p_actor_label text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.comments%rowtype;
  previous_status text;
  audit_id bigint;
  subscription public.comment_notification_subscriptions%rowtype;
  parent_subscription public.comment_notification_subscriptions%rowtype;
  parent_is_same_actor boolean := false;
begin
  if p_status not in ('approved', 'rejected', 'spam', 'deleted')
    or char_length(trim(p_reason)) not between 2 and 500
  then
    raise exception 'comment_moderation_invalid' using errcode = '22023';
  end if;
  if p_actor_kind = 'user' then
    if p_actor_user_id is null or not exists (
      select 1
      from public.profiles
      where id = p_actor_user_id and role in ('editor', 'admin')
    ) then
      raise exception 'comment_moderator_required' using errcode = '42501';
    end if;
  elsif p_actor_kind = 'system' then
    if p_actor_user_id is not null
      or p_actor_label is null
      or trim(p_actor_label) !~ '^[a-zA-Z0-9:_-]{2,80}$'
    then
      raise exception 'comment_moderator_required' using errcode = '42501';
    end if;
  else
    raise exception 'comment_moderator_required' using errcode = '42501';
  end if;

  select * into target
  from public.comments
  where comments.id = p_comment_id
  for update;
  if not found then
    raise exception 'comment_not_found' using errcode = 'P0002';
  end if;
  if target.status = 'deleted' then
    raise exception 'comment_operation_not_allowed' using errcode = '42501';
  end if;
  if p_status = 'approved'
    and target.parent_id is not null
    and not exists (
      select 1
      from public.comments parent
      where parent.id = target.parent_id
        and parent.status = 'approved'
    )
  then
    raise exception 'comment_operation_not_allowed' using errcode = '42501';
  end if;
  previous_status := target.status;

  update public.comments set
    status = p_status,
    body = case when p_status = 'deleted' then '[deleted]' else body end,
    author_display_name = case when p_status = 'deleted' then 'Deleted user' else author_display_name end,
    deleted_at = case when p_status = 'deleted' then now() else null end
  where comments.id = p_comment_id;

  insert into public.comment_moderation_audit (
    comment_id,
    action,
    actor_kind,
    actor_user_id,
    actor_label,
    previous_status,
    next_status,
    reason
  )
  values (
    p_comment_id,
    case p_status
      when 'approved' then 'approved'
      when 'rejected' then 'rejected'
      when 'spam' then 'marked_spam'
      else 'moderator_deleted'
    end,
    case when p_actor_kind = 'user' then 'moderator' else 'system' end,
    p_actor_user_id,
    p_actor_label,
    previous_status,
    p_status,
    trim(p_reason)
  )
  returning id into audit_id;

  update public.comment_reports set
    status = 'resolved',
    resolved_at = now(),
    resolved_by = p_actor_user_id
  where comment_id = p_comment_id and status = 'open';

  select * into subscription
  from public.comment_notification_subscriptions
  where comment_id = p_comment_id
    and verified_at is not null
    and unsubscribed_at is null
    and notify_on_moderation
  limit 1;

  if found and previous_status is distinct from p_status then
    insert into public.comment_notifications (
      subscription_id,
      comment_id,
      kind,
      recipient_email,
      recipient_email_hash,
      locale,
      payload,
      dedupe_key
    )
    values (
      subscription.id,
      p_comment_id,
      'moderation',
      subscription.email,
      subscription.email_hash,
      target.locale,
      jsonb_build_object(
        'subscriptionId', subscription.id,
        'commentId', p_comment_id,
        'articleId', target.article_id,
        'articleSlug', (select article.slug from public.articles article where article.id = target.article_id),
        'locale', target.locale,
        'status', p_status
      ),
      'comment-moderation:' || audit_id::text
    );
  end if;

  if target.parent_id is not null
    and p_status = 'approved'
    and previous_status is distinct from 'approved'
  then
    select parent_preference.*
    into parent_subscription
    from public.comment_notification_subscriptions parent_preference
    where parent_preference.comment_id = target.parent_id
      and parent_preference.verified_at is not null
      and parent_preference.unsubscribed_at is null
      and parent_preference.notify_on_replies
    limit 1;

    if found then
      select coalesce(
        (target.author_kind = 'authenticated' and parent.author_user_id = target.author_user_id)
        or
        (target.author_kind = 'guest' and parent.guest_identity_hash = target.guest_identity_hash),
        false
      )
      into parent_is_same_actor
      from public.comments parent
      where parent.id = target.parent_id;
    end if;

    if parent_subscription.id is not null and not parent_is_same_actor then
      insert into public.comment_notifications (
        subscription_id,
        comment_id,
        kind,
        recipient_email,
        recipient_email_hash,
        locale,
        payload,
        dedupe_key
      )
      values (
        parent_subscription.id,
        p_comment_id,
        'reply',
        parent_subscription.email,
        parent_subscription.email_hash,
        target.locale,
        jsonb_build_object(
          'subscriptionId', parent_subscription.id,
          'commentId', p_comment_id,
          'parentId', target.parent_id,
          'articleId', target.article_id,
          'articleSlug', (select article.slug from public.articles article where article.id = target.article_id),
          'locale', target.locale
        ),
        'comment-reply:' || p_comment_id::text || ':' || parent_subscription.id::text
      )
      on conflict (dedupe_key) do nothing;
    end if;
  end if;
end;
$$;

create or replace function public.verify_comment_notification_subscription(
  p_subscription_id uuid,
  p_token_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.comment_notification_subscriptions set verified_at = coalesce(verified_at, now())
  where id = p_subscription_id
    and verification_token_hash = p_token_hash
    and verification_expires_at >= now()
    and unsubscribed_at is null;

  if not found then
    raise exception 'comment_notification_token_invalid' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.unsubscribe_comment_notifications(
  p_subscription_id uuid,
  p_token_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.comment_notification_subscriptions set unsubscribed_at = coalesce(unsubscribed_at, now())
  where id = p_subscription_id
    and verification_token_hash = p_token_hash;

  if not found then
    raise exception 'comment_notification_token_invalid' using errcode = 'P0001';
  end if;

  update public.comment_notifications set
    status = 'cancelled',
    processed_at = now(),
    locked_at = null,
    worker_id = null
  where subscription_id = p_subscription_id
    and status in ('pending', 'failed', 'processing')
    and dispatch_started_at is null;
end;
$$;

create or replace function public.claim_comment_notifications(
  p_worker_id text,
  p_limit integer
)
returns setof public.comment_notifications
language plpgsql
security definer
set search_path = ''
as $$
begin
  if trim(p_worker_id) !~ '^[a-zA-Z0-9:_-]{2,100}$'
    or p_limit not between 1 and 100
  then
    raise exception 'comment_notification_claim_invalid' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select notification.id
    from public.comment_notifications notification
    where (
        notification.status in ('pending', 'failed')
        or (
          notification.status = 'processing'
          and notification.locked_at < now() - interval '15 minutes'
        )
      )
      and notification.available_at <= now()
      and notification.attempts < 20
    order by notification.available_at, notification.created_at, notification.id
    for update skip locked
    limit p_limit
  )
  update public.comment_notifications notification set
    status = 'processing',
    attempts = notification.attempts + 1,
    locked_at = now(),
    worker_id = trim(p_worker_id),
    dispatch_started_at = null,
    last_error = null
  from candidates
  where notification.id = candidates.id
  returning notification.*;
end;
$$;

create or replace function public.start_comment_notification_delivery(
  p_notification_id uuid,
  p_worker_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  started boolean;
begin
  if trim(p_worker_id) !~ '^[a-zA-Z0-9:_-]{2,100}$' then
    raise exception 'comment_notification_claim_invalid' using errcode = '22023';
  end if;

  update public.comment_notifications notification set
    dispatch_started_at = now()
  where notification.id = p_notification_id
    and notification.status = 'processing'
    and notification.worker_id = trim(p_worker_id)
    and notification.dispatch_started_at is null
    and exists (
      select 1
      from public.comment_notification_subscriptions subscription
      where subscription.id = notification.subscription_id
        and subscription.unsubscribed_at is null
        and (
          (
            notification.kind = 'verification'
            and subscription.verified_at is null
            and subscription.verification_expires_at >= now()
          )
          or (
            notification.kind in ('reply', 'moderation')
            and subscription.verified_at is not null
          )
        )
    )
  returning true into started;

  if coalesce(started, false) then
    return true;
  end if;

  update public.comment_notifications notification set
    status = 'cancelled',
    processed_at = now(),
    locked_at = null,
    worker_id = null
  where notification.id = p_notification_id
    and notification.status = 'processing'
    and notification.worker_id = trim(p_worker_id)
    and notification.dispatch_started_at is null;

  return false;
end;
$$;

create or replace function public.complete_comment_notification(
  p_notification_id uuid,
  p_worker_id text,
  p_succeeded boolean,
  p_provider_message_id text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.comment_notifications set
    status = case when p_succeeded then 'sent' else 'failed' end,
    provider_message_id = case when p_succeeded then nullif(trim(p_provider_message_id), '') else null end,
    last_error = case when p_succeeded then null else left(coalesce(trim(p_error), 'delivery failed'), 1000) end,
    available_at = case
      when p_succeeded then available_at
      else now() + make_interval(secs => least(3600, 30 * (2 ^ least(attempts, 7))))
    end,
    processed_at = case when p_succeeded then now() else null end,
    locked_at = null,
    worker_id = null,
    dispatch_started_at = case when p_succeeded then dispatch_started_at else null end
  where id = p_notification_id
    and status = 'processing'
    and worker_id = trim(p_worker_id)
    and dispatch_started_at is not null;

  if not found then
    raise exception 'comment_notification_not_claimed' using errcode = '42501';
  end if;
end;
$$;

alter table public.comments enable row level security;
alter table public.comments force row level security;
alter table public.comment_reports enable row level security;
alter table public.comment_reports force row level security;
alter table public.comment_moderation_audit enable row level security;
alter table public.comment_moderation_audit force row level security;
alter table public.comment_rate_limits enable row level security;
alter table public.comment_rate_limits force row level security;
alter table public.comment_notification_subscriptions enable row level security;
alter table public.comment_notification_subscriptions force row level security;
alter table public.comment_notifications enable row level security;
alter table public.comment_notifications force row level security;

drop policy if exists comments_public_approved_read on public.comments;
create policy comments_public_approved_read on public.comments
  for select to anon, authenticated
  using (
    status = 'approved'
    and public.comment_parent_is_approved(parent_id)
    and exists (
      select 1
      from public.articles article
      where article.id = comments.article_id
        and article.locale = comments.locale
        and article.status = 'published'
    )
  );

revoke all on table public.comments from anon, authenticated;
grant select (
  id,
  article_id,
  locale,
  parent_id,
  body,
  author_display_name,
  status,
  created_at,
  updated_at,
  edited_at
) on table public.comments to anon, authenticated;
revoke all on table public.comment_reports from anon, authenticated;
revoke all on table public.comment_moderation_audit from anon, authenticated;
revoke all on table public.comment_rate_limits from anon, authenticated;
revoke all on table public.comment_notification_subscriptions from anon, authenticated;
revoke all on table public.comment_notifications from anon, authenticated;

revoke all on function public.create_comment(
  uuid, text, uuid, text, text, text, uuid, text, text, text,
  uuid, text, text, boolean, boolean, text
) from public;
revoke all on function public.list_own_comments(
  uuid, text, uuid, text, uuid, text, text, timestamptz, uuid, integer
) from public;
revoke all on function public.edit_own_comment(
  uuid, text, text, text, uuid, text, text, text, text
) from public;
revoke all on function public.delete_own_comment(
  uuid, text, uuid, text, text, text, text
) from public;
revoke all on function public.report_comment(
  uuid, text, text, text, uuid, text, text, text, text
) from public;
revoke all on function public.moderate_comment(
  uuid, text, text, text, uuid, text
) from public;
revoke all on function public.verify_comment_notification_subscription(uuid, text) from public;
revoke all on function public.unsubscribe_comment_notifications(uuid, text) from public;
revoke all on function public.claim_comment_notifications(text, integer) from public;
revoke all on function public.start_comment_notification_delivery(uuid, text) from public;
revoke all on function public.complete_comment_notification(
  uuid, text, boolean, text, text
) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on table public.comments to service_role;
    grant all on table public.comment_reports to service_role;
    grant all on table public.comment_moderation_audit to service_role;
    grant all on table public.comment_rate_limits to service_role;
    grant all on table public.comment_notification_subscriptions to service_role;
    grant all on table public.comment_notifications to service_role;
    grant usage, select on sequence public.comment_moderation_audit_id_seq to service_role;

    grant execute on function public.create_comment(
      uuid, text, uuid, text, text, text, uuid, text, text, text,
      uuid, text, text, boolean, boolean, text
    ) to service_role;
    grant execute on function public.list_own_comments(
      uuid, text, uuid, text, uuid, text, text, timestamptz, uuid, integer
    ) to service_role;
    grant execute on function public.edit_own_comment(
      uuid, text, text, text, uuid, text, text, text, text
    ) to service_role;
    grant execute on function public.delete_own_comment(
      uuid, text, uuid, text, text, text, text
    ) to service_role;
    grant execute on function public.report_comment(
      uuid, text, text, text, uuid, text, text, text, text
    ) to service_role;
    grant execute on function public.moderate_comment(
      uuid, text, text, text, uuid, text
    ) to service_role;
    grant execute on function public.verify_comment_notification_subscription(uuid, text)
      to service_role;
    grant execute on function public.unsubscribe_comment_notifications(uuid, text)
      to service_role;
    grant execute on function public.claim_comment_notifications(text, integer)
      to service_role;
    grant execute on function public.start_comment_notification_delivery(uuid, text)
      to service_role;
    grant execute on function public.complete_comment_notification(
      uuid, text, boolean, text, text
    ) to service_role;
  end if;
end;
$$;
