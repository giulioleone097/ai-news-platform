const publicCache = "public, s-maxage=300, stale-while-revalidate=3600";

export function feedResponse(body: string, contentType: string) {
  return new Response(body, {
    headers: {
      "Cache-Control": publicCache,
      "Content-Type": `${contentType}; charset=utf-8`,
    },
  });
}

export function notFoundResponse() {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
