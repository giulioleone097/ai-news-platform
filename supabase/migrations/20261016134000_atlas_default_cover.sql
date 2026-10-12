-- The bundled default cover is called after AtlasNews now (apps/web/public/media/atlas-hero.webp). Articles keep the
-- cover they have: the site still serves the old address, with a redirect, and reads it as the new one.

alter table public.articles
  alter column cover_image set default '/media/atlas-hero.webp';
