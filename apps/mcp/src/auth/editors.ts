
export interface EditorProfile {
  /** The `public.authors` row that articles written by this editor are attributed to. */
  authorId: string;
  role: string;
}

/** Looks up the newsroom profile of a Supabase Auth user; null when the user has none. */
export interface EditorDirectory {
  find(userId: string): Promise<EditorProfile | null>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maximumEntries = 500;

export interface SupabaseEditorDirectoryOptions {
  /** The project URL, such as `https://<ref>.supabase.co/`. */
  url: string;
  serviceRoleKey: string;
  /** How long an answer is reused. Removing an editor takes effect within this time. */
  cacheMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

/** Reads `public.profiles` through PostgREST with the service-role key, with a short answer cache. */
export function supabaseEditorDirectory(options: SupabaseEditorDirectoryOptions): EditorDirectory {
  const cacheMs = options.cacheMs ?? 30_000;
  const send = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { profile: EditorProfile | null; expires: number }>();

  return {
    async find(userId) {
      // The id goes into a query string, so only a well-formed UUID may pass.
      if (!uuid.test(userId)) return null;
      const hit = cache.get(userId);
      if (hit && hit.expires > now()) return hit.profile;

      const endpoint = new URL("rest/v1/profiles", options.url.endsWith("/") ? options.url : `${options.url}/`);
      endpoint.searchParams.set("select", "author_id,role");
      endpoint.searchParams.set("id", `eq.${userId}`);
      const response = await send(endpoint, {
        headers: {
          apikey: options.serviceRoleKey,
          Authorization: `Bearer ${options.serviceRoleKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error(`Editor profile lookup failed with status ${response.status}.`);

      const [row] = (await response.json()) as Array<{ author_id?: unknown; role?: unknown }>;
      const profile = row && typeof row.author_id === "string" && uuid.test(row.author_id) && typeof row.role === "string"
        ? { authorId: row.author_id, role: row.role }
        : null;

      if (cache.size >= maximumEntries) cache.clear();
      cache.set(userId, { profile, expires: now() + cacheMs });
      return profile;
    },
  };
}
