import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod/v4";
import { locales } from "@/i18n";
import { searchPublishedArticles } from "@/lib/editorial-queries";
import { toFeedItem } from "@/components/site/feed-item";
import {
  decodeArticleCursor,
  encodeArticleCursor,
} from "@atlasnews/core/editorial/application/public-feed";
import { claimStatuses } from "@atlasnews/core/editorial/domain/article";
import { feedPageSize } from "@atlasnews/core/editorial/domain/editorial-service";

const slug = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const querySchema = z.object({
  locale: z.enum(locales),
  category: slug.optional(),
  entity: slug.optional(),
  status: z.enum(claimStatuses).optional(),
  query: z.string().trim().min(1).max(120).optional(),
  cursor: z.string().min(1).max(512).optional(),
});

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const result = querySchema.safeParse({
    locale: searchParams.get("locale"),
    category: searchParams.get("category") || undefined,
    entity: searchParams.get("entity") || undefined,
    status: searchParams.get("status") || undefined,
    query: searchParams.get("q") || undefined,
    cursor: searchParams.get("cursor") || undefined,
  });

  if (!result.success) {
    return NextResponse.json({ error: "Invalid article query." }, { status: 400 });
  }

  const decodedCursor = result.data.cursor
    ? decodeArticleCursor(result.data.cursor)
    : undefined;
  if (result.data.cursor && !decodedCursor) {
    return NextResponse.json({ error: "Invalid article cursor." }, { status: 400 });
  }

  const page = await searchPublishedArticles({
    locale: result.data.locale,
    category: result.data.category,
    entity: result.data.entity,
    claimStatus: result.data.status,
    query: result.data.query,
    cursor: decodedCursor ?? undefined,
    limit: feedPageSize,
  });

  return NextResponse.json(
    {
      items: page.items.map(toFeedItem),
      nextCursor: encodeArticleCursor(page.nextCursor),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
