import { isAllowedEditorialImageSource } from "@atlasnews/core/editorial/domain/editorial-image";

/**
 * Whether the site accepts and shows this image, under the deployment's policy: bundled and site media always, and the
 * public bucket of the configured Supabase project. The literal `process.env.NEXT_PUBLIC_*` read is inlined
 * by the bundler, so this runs in the browser (the Studio preview) as well as on the server.
 */
export function isEditorialImageAllowed(source: string) {
  return isAllowedEditorialImageSource(source, process.env.NEXT_PUBLIC_SUPABASE_URL);
}
