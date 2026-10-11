import { readUploadedMedia } from "@/server/composition";

export const dynamic = "force-dynamic";

type MediaRouteContext = { params: Promise<{ name: string }> };

/** Files uploaded in the Studio or through the newsroom tools on Sites, read from the Site's R2 bucket. */
export async function GET(_request: Request, context: MediaRouteContext) {
  const { name } = await context.params;
  const object = await readUploadedMedia(name);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      // Names are random and never reused, so a stored file never changes.
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      ...(object.httpMetadata?.contentType ? {} : { "Content-Disposition": "attachment" }),
    },
  });
}
