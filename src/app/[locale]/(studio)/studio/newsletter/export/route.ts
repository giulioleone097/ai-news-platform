import { isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { csvCell } from "@/lib/csv";
import { getStudioEditorialRepositories } from "@/modules/editorial/infrastructure/container";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (!isLocale(locale)) return new Response("Not found", { status: 404 });
  await requireEditor(locale);
  const repositories = await getStudioEditorialRepositories();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(
        ["email", "locale", "status", "source", "consented_at", "unsubscribed_at"]
          .map(csvCell)
          .join(",") + "\n",
      ));
      try {
        const pageSize = 1_000;
        for (let offset = 0; ; offset += pageSize) {
          const page = await repositories.newsletter.listSubscriptions({
            locale,
            limit: pageSize,
            offset,
          });
          for (const item of page.items) {
            controller.enqueue(encoder.encode([
              item.email,
              item.locale,
              item.status,
              item.source,
              item.consentedAt,
              item.unsubscribedAt ?? "",
            ].map(csvCell).join(",") + "\n"));
          }
          if (!page.hasMore) break;
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="neura-${locale}-audience.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
