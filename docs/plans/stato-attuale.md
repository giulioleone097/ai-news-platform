# Stato attuale di ai-news-platform (10 ottobre 2026)

Valutazione fatta su `main` (`b981d58`) più la PR #1 in bozza. Verifiche eseguite in locale con Node 26: `npm ci`, lint, typecheck, 187 test su 44 file, `plugin:check` e `next build` sono tutti passati.

## Cosa c'è e funziona

- Portale Next.js 16 bilingue (`/en`, `/it`) con home, ultime, categorie, ricerca, articolo, RSS, segnalibri e commenti.
- Studio editoriale con articoli, media, commenti, newsletter (Resend, double opt-in) e pubblicazione social (LinkedIn, X, WhatsApp) tramite outbox con lease e idempotenza.
- Supabase con RLS, ricerca full-text e 7 migrazioni.
- MCP pubblico in sola lettura su `/api/mcp` (5 tool, protocollo `2026-07-28`, compatibile con client più vecchi: `src/modules/mcp/http.ts:131`) e MCP admin su `/api/mcp/admin` (37 tool, chiave API).
- PR #1 (bozza): MCP App condivisa, app nella sidebar e pannello di ChatGPT, menzioni, form del briefing, skill di onboarding, MCP Events `article.published`.

## Cosa manca rispetto all'obiettivo

1. **Deploy legato a Vercel.** `next.config.ts:12` e `vercel.json:30` (tre cron al minuto) presuppongono Vercel. ChatGPT Sites usa un runtime a Worker, senza servizi in background né TCP grezzo; nessuna pagina OpenAI dice se Next.js ci gira.
2. **Due server MCP, OpenAI ne ammette uno per plugin.** `plugins/neura-ai-news/.mcp.json:5` e `:9` puntano a due endpoint su `localhost`.
3. **Chiave API condivisa per gli editor.** `src/modules/mcp/admin-auth.ts:13`: nessun utente, scope o scadenza. ChatGPT e Claude richiedono OAuth 2.1 per un plugin pubblico.
4. **Nessun WebMCP** (`document.modelContext` non compare nel codice) e nessun `llms.txt`, Markdown per pagina o JSON Feed.
5. **Definizioni dei tool duplicate.** I nomi vivono in `src/modules/mcp/metadata.ts`, nelle 42 registrazioni a mano (`public-server.ts:178`, `admin-server.ts:153`, `admin-operations.ts:121`) e nella documentazione. Mancano `search` e `fetch`, che rendono il sito una fonte di conoscenza per ChatGPT.
6. **Un solo deployable.** Sito, Studio, MCP, webhook e worker stanno nella stessa app Next.js.
7. **Confini esagonali dichiarati ma non verificati.** `eslint.config.mjs` non ha regole sugli import. Violazioni trovate: `src/modules/comments/application/admin-tools.ts:10` importa l'infrastruttura; cinque file di dominio importano `@/i18n`; `newsletter-delivery` non ha la divisione in livelli.
8. **Home poco densa e modello dei contenuti povero.** Su telefono si vede una storia nella prima schermata. Un articolo ha solo una categoria: niente entità (aziende, modelli, prodotti), stato della notizia, punti chiave o fonti annotate.
9. **Pacchetto plugin non pubblicabile.** Manifest nel vecchio formato `.codex-plugin`, niente `LICENSE`, URL locali, nessuna delle quattro pagine richieste da OpenAI (sito, supporto, privacy, termini).
10. **Nome incoerente.** Il codice dice NEURA, il progetto AtlasNews.

## Siti di riferimento studiati

TestingCatalog, The Decoder, The Rundown AI, Techmeme, Simon Willison, AINews (smol.ai). Da copiare: entità nella navigazione, stato visibile su ogni storia, fonti con «cosa dimostrano», punti chiave, un unico flusso per data, superficie leggibile dalle macchine. Nessuno di loro offre un server MCP, una timeline per entità da indiscrezione a rilascio, o un'esperienza bilingue vera.

## Punti non confermati

- Next.js e Supabase su ChatGPT Sites: nessuna fonte primaria; serve una prova.
- Una frase di OpenAI che dica di evitare duplicazione tra tool MCP e WebMCP non è stata trovata. La guida dice di «riusare la logica e i permessi esistenti» e che «un sito può supportare entrambi». Il piano la tratta come regola di progetto.
- Supporto di `2026-07-28` e MRTR nei connettori ospitati di Claude: non dichiarato.
- Supabase Auth come authorization server per ChatGPT (CIMD, PKCE S256) e Claude: da provare.
