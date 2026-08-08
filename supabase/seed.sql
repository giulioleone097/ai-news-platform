insert into public.authors (id, name, role, initials)
values ('7e05ad26-5ee6-4747-ae9b-b14547462239', 'Elena Riva', 'Editrice', 'ER')
on conflict (id) do update set
  name = excluded.name,
  role = excluded.role,
  initials = excluded.initials;

insert into public.categories (id, slug, name, description, position)
values
  ('d302b709-56bb-47c0-b957-7ce647e1c051', 'ricerca', 'Ricerca', 'Modelli, paper e frontiere tecniche.', 1),
  ('239ac46f-dfd3-4cba-bd61-b5b1a2711b32', 'aziende', 'Aziende', 'Prodotti, mercato e lavoro.', 2),
  ('92fb4bd5-9bb4-45fc-98b1-b56578908c09', 'policy', 'Policy', 'Regole, diritti e governance.', 3),
  ('67f1f2df-dacc-4101-8fcc-42f845019583', 'strumenti', 'Strumenti', 'Tool e workflow verificati.', 4),
  ('f8ad7bed-8cca-4d50-8a71-2c5782c736fe', 'societa', 'Etica e società', 'Impatto, cultura e persone.', 5)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description,
  position = excluded.position;

insert into public.articles (
  id, slug, title, excerpt, content, cover_image, cover_alt, status,
  category_id, author_id, featured, reading_minutes, published_at
)
values (
  'a118b5a2-f046-4245-9c09-538a552a3e88',
  'gli-agenti-ai-entrano-nel-lavoro-quotidiano',
  'Gli agenti AI entrano nel lavoro quotidiano',
  'Dai prototipi ai processi reali: cosa sta funzionando, dove fallisce e cosa osservare adesso.',
  E'## Dal prototipo al processo\n\nDopo due anni di sperimentazioni, gli agenti AI stanno uscendo dai sandbox per entrare nei flussi operativi.\n\n## Dove gli agenti creano valore\n\nIl valore emerge quando l’agente può mostrare fonti, lasciare una traccia e chiedere conferma nei passaggi ad alto impatto.\n\n## Dove ancora falliscono\n\nContesto incompleto, permessi troppo ampi e obiettivi ambigui restano le cause principali degli errori.',
  '/media/neura-agents-hero.png',
  'Scultura astratta nera attraversata da luce corallo',
  'published',
  'd302b709-56bb-47c0-b957-7ce647e1c051',
  '7e05ad26-5ee6-4747-ae9b-b14547462239',
  true,
  8,
  '2026-08-08T12:34:00Z'
)
on conflict (id) do update set
  title = excluded.title,
  excerpt = excluded.excerpt,
  content = excluded.content,
  updated_at = now();

-- After creating the first user in Supabase Auth, grant editorial access once:
-- insert into public.profiles (id, author_id, role)
-- values ('AUTH_USER_UUID', '7e05ad26-5ee6-4747-ae9b-b14547462239', 'admin');
