-- 0000_content: authors, categories, articles with their story fields, entities, distribution publications and article search.
CREATE TABLE authors (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  role TEXT NOT NULL DEFAULT 'Editor' CHECK (length(role) BETWEEN 2 AND 80),
  initials TEXT NOT NULL CHECK (length(initials) BETWEEN 1 AND 4),
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint
-- One row per locale of a category; the translation key ties the locales together. Slugs are lowercase kebab-case
-- (the GLOB checks are the SQLite form of the Postgres pattern ^[a-z0-9]+(?:-[a-z0-9]+)*$), locales are "en" or "en-GB".
CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL,
  translation_key TEXT NOT NULL CHECK (length(translation_key) BETWEEN 2 AND 120),
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale GLOB '[a-z][a-z]' OR locale GLOB '[a-z][a-z]-[A-Z][A-Z]'),
  slug TEXT NOT NULL CHECK (
    length(slug) > 0 AND slug NOT GLOB '*[^a-z0-9-]*' AND slug NOT GLOB '-*' AND slug NOT GLOB '*-' AND slug NOT GLOB '*--*'
  ),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 32767),
  created_at TEXT NOT NULL,
  CONSTRAINT categories_translation_locale_key UNIQUE (translation_key, locale),
  CONSTRAINT categories_locale_slug_key UNIQUE (locale, slug),
  CONSTRAINT categories_id_locale_key UNIQUE (id, locale)
);
--> statement-breakpoint
CREATE INDEX categories_locale_position_idx ON categories (locale, position, id);
--> statement-breakpoint
-- key_points is a JSON array of up to 3 strings and sources a JSON array of up to 10 {title, url, supports}
-- objects; the triggers below check their elements, which a CHECK constraint cannot (no subqueries).
CREATE TABLE articles (
  id TEXT PRIMARY KEY NOT NULL,
  translation_key TEXT NOT NULL CHECK (length(translation_key) BETWEEN 2 AND 120),
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale GLOB '[a-z][a-z]' OR locale GLOB '[a-z][a-z]-[A-Z][A-Z]'),
  slug TEXT NOT NULL CHECK (
    length(slug) > 0 AND slug NOT GLOB '*[^a-z0-9-]*' AND slug NOT GLOB '-*' AND slug NOT GLOB '*-' AND slug NOT GLOB '*--*'
  ),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 8 AND 180),
  excerpt TEXT NOT NULL CHECK (length(excerpt) BETWEEN 20 AND 360),
  content TEXT NOT NULL CHECK (length(content) >= 20),
  cover_image TEXT NOT NULL DEFAULT '/media/neura-agents-hero.webp',
  cover_alt TEXT NOT NULL CHECK (length(cover_alt) BETWEEN 3 AND 240),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'scheduled', 'published')),
  category_id TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES authors (id) ON DELETE RESTRICT,
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  reading_minutes INTEGER NOT NULL DEFAULT 1 CHECK (reading_minutes BETWEEN 1 AND 180),
  published_at TEXT,
  scheduled_for TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  claim_status TEXT NOT NULL DEFAULT 'analysis' CHECK (claim_status IN ('confirmed', 'rollout', 'test', 'rumour', 'analysis')),
  key_points TEXT NOT NULL DEFAULT '[]' CHECK (
    CASE WHEN json_valid(key_points) THEN json_type(key_points) = 'array' AND json_array_length(key_points) <= 3 ELSE 0 END
  ),
  sources TEXT NOT NULL DEFAULT '[]' CHECK (
    CASE WHEN json_valid(sources) THEN json_type(sources) = 'array' AND json_array_length(sources) <= 10 ELSE 0 END
  ),
  CONSTRAINT articles_translation_locale_key UNIQUE (translation_key, locale),
  CONSTRAINT articles_locale_slug_key UNIQUE (locale, slug),
  CONSTRAINT articles_category_locale_fkey FOREIGN KEY (category_id, locale) REFERENCES categories (id, locale) ON DELETE RESTRICT,
  CONSTRAINT articles_publish_state_check CHECK (status <> 'published' OR published_at IS NOT NULL),
  CONSTRAINT articles_schedule_state_check CHECK (status <> 'scheduled' OR scheduled_for IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX articles_author_id_idx ON articles (author_id);
--> statement-breakpoint
CREATE INDEX articles_category_id_idx ON articles (category_id);
--> statement-breakpoint
CREATE INDEX articles_status_published_idx ON articles (locale, status, published_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX articles_category_status_published_idx ON articles (locale, category_id, status, published_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX articles_locale_updated_idx ON articles (locale, updated_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX articles_scheduled_idx ON articles (scheduled_for, id) WHERE status = 'scheduled';
--> statement-breakpoint
CREATE INDEX articles_claim_status_published_idx ON articles (locale, claim_status, published_at DESC, id DESC) WHERE status = 'published';
--> statement-breakpoint
-- Up to 3 key points of 3-140 characters, and up to 10 sources of exactly {title 3-160, supports 3-240, url https, no spaces, at most 2048}.
CREATE TRIGGER articles_story_fields_insert BEFORE INSERT ON articles
WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.key_points) AS point
  WHERE point.type <> 'text' OR length(trim(point.value)) NOT BETWEEN 3 AND 140
) OR EXISTS (
  SELECT 1 FROM json_each(NEW.sources) AS source
  WHERE source.type <> 'object'
    OR (SELECT count(*) FROM json_each(source.value)) <> 3
    OR json_type(source.value, '$.title') IS NOT 'text'
    OR length(trim(json_extract(source.value, '$.title'))) NOT BETWEEN 3 AND 160
    OR json_type(source.value, '$.supports') IS NOT 'text'
    OR length(trim(json_extract(source.value, '$.supports'))) NOT BETWEEN 3 AND 240
    OR json_type(source.value, '$.url') IS NOT 'text'
    OR length(json_extract(source.value, '$.url')) > 2048
    OR json_extract(source.value, '$.url') NOT GLOB 'https://[^/?#@ ]*'
    OR instr(json_extract(source.value, '$.url'), ' ') > 0
    OR instr(json_extract(source.value, '$.url'), char(9)) > 0
    OR instr(json_extract(source.value, '$.url'), char(10)) > 0
    OR instr(json_extract(source.value, '$.url'), char(13)) > 0
)
BEGIN
  SELECT RAISE(ABORT, 'Invalid key points or sources');
END;
--> statement-breakpoint
CREATE TRIGGER articles_story_fields_update BEFORE UPDATE OF key_points, sources ON articles
WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.key_points) AS point
  WHERE point.type <> 'text' OR length(trim(point.value)) NOT BETWEEN 3 AND 140
) OR EXISTS (
  SELECT 1 FROM json_each(NEW.sources) AS source
  WHERE source.type <> 'object'
    OR (SELECT count(*) FROM json_each(source.value)) <> 3
    OR json_type(source.value, '$.title') IS NOT 'text'
    OR length(trim(json_extract(source.value, '$.title'))) NOT BETWEEN 3 AND 160
    OR json_type(source.value, '$.supports') IS NOT 'text'
    OR length(trim(json_extract(source.value, '$.supports'))) NOT BETWEEN 3 AND 240
    OR json_type(source.value, '$.url') IS NOT 'text'
    OR length(json_extract(source.value, '$.url')) > 2048
    OR json_extract(source.value, '$.url') NOT GLOB 'https://[^/?#@ ]*'
    OR instr(json_extract(source.value, '$.url'), ' ') > 0
    OR instr(json_extract(source.value, '$.url'), char(9)) > 0
    OR instr(json_extract(source.value, '$.url'), char(10)) > 0
    OR instr(json_extract(source.value, '$.url'), char(13)) > 0
)
BEGIN
  SELECT RAISE(ABORT, 'Invalid key points or sources');
END;
--> statement-breakpoint
-- Full-text search over title, excerpt and body, kept in step with articles by the triggers below. The tokenizer folds
-- case and diacritics, so one table serves both locales; the adapter matches words by prefix instead of stemming.
CREATE VIRTUAL TABLE article_search USING fts5(title, excerpt, content, article_id UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');
--> statement-breakpoint
CREATE TRIGGER articles_search_insert AFTER INSERT ON articles
BEGIN
  INSERT INTO article_search (article_id, title, excerpt, content) VALUES (NEW.id, NEW.title, NEW.excerpt, NEW.content);
END;
--> statement-breakpoint
CREATE TRIGGER articles_search_update AFTER UPDATE OF title, excerpt, content ON articles
BEGIN
  DELETE FROM article_search WHERE article_id = OLD.id;
  INSERT INTO article_search (article_id, title, excerpt, content) VALUES (NEW.id, NEW.title, NEW.excerpt, NEW.content);
END;
--> statement-breakpoint
CREATE TRIGGER articles_search_delete AFTER DELETE ON articles
BEGIN
  DELETE FROM article_search WHERE article_id = OLD.id;
END;
--> statement-breakpoint
CREATE TABLE social_publications (
  id TEXT PRIMARY KEY NOT NULL,
  article_id TEXT NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('newsletter', 'linkedin', 'x', 'whatsapp')),
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('draft', 'ready', 'published', 'failed')),
  message TEXT,
  external_url TEXT,
  scheduled_for TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (article_id, channel)
);
--> statement-breakpoint
CREATE INDEX social_publications_ready_idx ON social_publications (status, scheduled_for, id) WHERE status = 'ready';
--> statement-breakpoint
-- The companies, models and products a story is about. A model or a product may belong to a company; a company has no parent.
CREATE TABLE entities (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('company', 'model', 'product')),
  slug TEXT NOT NULL UNIQUE CHECK (
    length(slug) BETWEEN 1 AND 96 AND slug NOT GLOB '*[^a-z0-9-]*' AND slug NOT GLOB '-*' AND slug NOT GLOB '*-' AND slug NOT GLOB '*--*'
  ),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  official_url TEXT CHECK (
    official_url IS NULL OR (
      length(official_url) <= 2048 AND official_url GLOB 'https://?*'
      AND instr(official_url, ' ') = 0 AND instr(official_url, char(9)) = 0
      AND instr(official_url, char(10)) = 0 AND instr(official_url, char(13)) = 0
    )
  ),
  parent_id TEXT REFERENCES entities (id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT entities_parent_check CHECK (parent_id IS NULL OR kind <> 'company')
);
--> statement-breakpoint
CREATE INDEX entities_kind_name_idx ON entities (kind, name);
--> statement-breakpoint
CREATE INDEX entities_parent_id_idx ON entities (parent_id) WHERE parent_id IS NOT NULL;
--> statement-breakpoint
-- A model or a product belongs to a company, never to another model or product; a company with children stays a company.
CREATE TRIGGER entities_parent_insert BEFORE INSERT ON entities
WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM entities WHERE id = NEW.parent_id AND kind = 'company')
BEGIN
  SELECT RAISE(ABORT, 'The parent of an entity must be a company');
END;
--> statement-breakpoint
CREATE TRIGGER entities_parent_update BEFORE UPDATE OF parent_id, kind ON entities
WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM entities WHERE id = NEW.parent_id AND kind = 'company')
BEGIN
  SELECT RAISE(ABORT, 'The parent of an entity must be a company');
END;
--> statement-breakpoint
CREATE TRIGGER entities_company_children_update BEFORE UPDATE OF kind ON entities
WHEN NEW.kind <> 'company' AND EXISTS (SELECT 1 FROM entities WHERE parent_id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'A company with models or products stays a company');
END;
--> statement-breakpoint
CREATE TABLE entity_descriptions (
  entity_id TEXT NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale GLOB '[a-z][a-z]' OR locale GLOB '[a-z][a-z]-[A-Z][A-Z]'),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 280),
  PRIMARY KEY (entity_id, locale)
);
--> statement-breakpoint
CREATE TABLE article_entities (
  article_id TEXT NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities (id) ON DELETE RESTRICT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  PRIMARY KEY (article_id, entity_id)
);
--> statement-breakpoint
CREATE INDEX article_entities_entity_id_idx ON article_entities (entity_id, article_id);
--> statement-breakpoint
CREATE UNIQUE INDEX article_entities_one_primary_idx ON article_entities (article_id) WHERE is_primary = 1;
