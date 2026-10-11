-- Who may use the Studio and the newsroom tools on Sites: ChatGPT accounts, each mapped to an author and a role.
CREATE TABLE editors (
  id TEXT PRIMARY KEY NOT NULL,
  -- The ChatGPT email the editor was invited with. Matching it binds `user_id` at the first sign-in.
  email TEXT NOT NULL COLLATE NOCASE CHECK (length(email) BETWEEN 3 AND 254 AND email LIKE '%_@_%'),
  -- `oai-authenticated-user-id`: stable for one person on this Site, so it, not the email, identifies them.
  user_id TEXT CHECK (user_id IS NULL OR length(user_id) BETWEEN 1 AND 200),
  author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE RESTRICT,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'admin')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX editors_email_key ON editors (email);
--> statement-breakpoint
CREATE UNIQUE INDEX editors_user_id_key ON editors (user_id) WHERE user_id IS NOT NULL;
